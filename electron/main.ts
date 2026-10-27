import { app, BrowserWindow, ipcMain, Menu, nativeTheme, protocol, session, shell } from "electron";
import { promises as fs } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";

import { allowExternalFile, assertAllowedPath, registerFileIpc } from "./ipc-fs";
import { registerAiIpc } from "./ai-agent";
import { buildApplicationMenu, DEFAULT_MENU_STATE } from "./menu";
import { exportPdf, previewPdf } from "./pdf";
import { detectPandoc, exportWithPandoc } from "./pandoc";
import { registerUpdaterIpc, startUpdater } from "./updater";
import { DEFAULT_WINDOW_STATE, loadWindowState, rememberWindowState, type WindowState } from "./window-state";
import type { MenuState } from "../src/commands/menus";

/**
 * 主进程。
 *
 * 三件事：开窗口、把菜单点击转成命令 id 发给渲染进程、守住窗口关闭。
 * 文件读写全部在 ipc-fs.ts，这里只管生命周期。
 */

const APP_SCHEME = "app";
const DEV_URL = process.env.WRITARA_DEV_SERVER_URL ?? "";

/** 只按扩展名给 Content-Type，够渲染进程用即可。 */
const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: http: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
].join("; ");

let mainWindow: BrowserWindow | null = null;
let menuState: MenuState = DEFAULT_MENU_STATE;
let windowState: WindowState = DEFAULT_WINDOW_STATE;

/**
 * 启动打点。
 *
 * 只在 `WRITARA_STARTUP_LOG=1` 时启用：打包后双击启动看不到终端输出，
 * 所以把时间戳写到 `userData/startup.log`，排查「双击后很久没窗口」时直接看它。
 * 时间基准是 `process.uptime()`，也就是从进程创建算起，包含 Electron 自己的启动。
 */
const STARTUP_LOG = process.env.WRITARA_STARTUP_LOG === "1";
const startupMarks: string[] = [];

function markStartup(label: string): void {
  if (!STARTUP_LOG) return;
  const line = `${label} +${Math.round(process.uptime() * 1000)}ms`;
  startupMarks.push(line);
  console.log(`[startup] ${line}`);
}

function flushStartupLog(): void {
  if (!STARTUP_LOG || startupMarks.length === 0) return;
  const target = path.join(app.getPath("userData"), "startup.log");
  const head = `electron ${process.versions.electron} · ${new Date().toISOString()}`;
  void fs.writeFile(target, `${head}\n${startupMarks.join("\n")}\n`, "utf8").catch(() => undefined);
}

markStartup("main-module");

/** 每个窗口的脏标记与「允许关闭」状态。 */
const dirtyByContents = new Map<number, boolean>();
const closeAllowed = new Set<number>();
/** 已经订阅好事件的渲染进程；命令行传来的文件要等它就绪再发。 */
const shellReadyContents = new Set<number>();
let pendingFile: string | null = null;

app.setName("Writara");
// Windows 任务栏归属与「最近使用」需要它。
app.setAppUserModelId("com.writara.desktop");

/**
 * GPU 沙箱的自动降级。
 *
 * 在部分 Windows 机器上（显卡驱动 + 安全软件的组合），GPU 进程在沙箱里初始化要
 * 二十多秒；这段时间渲染进程连第一帧都出不来，`ready-to-show` 一直不触发，
 * 用户看到的就是「双击后很久没有任何窗口」。
 *
 * 第一次测到 `dom-ready` 超过 5 秒就记一个标记，下次启动关掉 GPU 沙箱。
 * 只影响 GPU 进程：渲染进程仍然是 `sandbox: true`，contextIsolation 不变。
 */
const GPU_FALLBACK_FILE = "gpu-fallback.json";

function gpuFallbackFile(): string {
  return path.join(app.getPath("userData"), GPU_FALLBACK_FILE);
}

function gpuFallbackEnabled(): boolean {
  if (process.platform !== "win32") return false;
  try {
    return JSON.parse(readFileSync(gpuFallbackFile(), "utf8")).disabled === true;
  } catch {
    return false;
  }
}

async function rememberGpuFallback(): Promise<void> {
  await fs
    .writeFile(gpuFallbackFile(), JSON.stringify({ disabled: true, at: new Date().toISOString() }), "utf8")
    .catch(() => undefined);
  console.log("[startup] GPU sandbox is slow on this machine; disabled for next launch");
}

const gpuSandboxOff = gpuFallbackEnabled();
if (gpuSandboxOff) app.commandLine.appendSwitch("disable-gpu-sandbox");

protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
  },
]);

function rendererRoot(): string {
  return path.join(app.getAppPath(), "dist");
}

function isInsideDir(root: string, target: string): boolean {
  const r = path.resolve(root);
  const t = path.resolve(target);
  return t === r || t.startsWith(`${r}${path.sep}`);
}

function openExternal(url: string): void {
  if (/^(https?:|mailto:)/i.test(url)) void shell.openExternal(url);
}

function sendCommand(id: string): void {
  const target =
    BrowserWindow.getFocusedWindow() ??
    BrowserWindow.getAllWindows().find((win) => !win.isDestroyed()) ??
    null;
  target?.webContents.send("menu:command", id);
}

function applyMenu(): void {
  Menu.setApplicationMenu(buildApplicationMenu(menuState, sendCommand));
}

function createWindow(state: WindowState = windowState): BrowserWindow {
  const win = new BrowserWindow({
    width: state.width,
    height: state.height,
    x: state.x,
    y: state.y,
    minWidth: 760,
    minHeight: 480,
    show: false,
    // 窗口先出现、内容后到：底色必须和启动页一致，不然会先闪一块白。
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#1c1a17" : "#f7f5f0",
    title: "Writara｜文叙",
    webPreferences: {
      preload: path.join(app.getAppPath(), "electron", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      spellcheck: true,
    },
  });

  const contentsId = win.webContents.id;
  dirtyByContents.set(contentsId, false);
  rememberWindowState(win);

  // 不再等 ready-to-show。那个事件要等渲染进程画出第一帧，而 Electron 启动 +
  // 主进程求值 + 渲染进程加载加起来才是用户感受到的「双击后毫无反应」。
  // 先把窗口亮出来（只有底色），启动页随后接上，用户至少知道自己点成功了。
  if (state.maximized) win.maximize();
  win.show();
  markStartup("window-shown");

  const windowStartedAt = Date.now();
  let domReady = false;
  win.once("ready-to-show", () => {
    markStartup("ready-to-show");
    flushStartupLog();
  });
  // 5 秒还没出第一帧，说明 GPU 沙箱在这台机器上有问题：先记下来，
  // 用户等不及关掉再开时，下一次就已经绕开它了。
  const slowTimer = setTimeout(() => {
    if (!domReady && process.platform === "win32" && !gpuSandboxOff) void rememberGpuFallback();
  }, 5000);
  win.webContents.once("dom-ready", () => {
    domReady = true;
    clearTimeout(slowTimer);
    const elapsed = Date.now() - windowStartedAt;
    markStartup(`dom-ready(${elapsed}ms)`);
  });
  win.webContents.on("preload-error", (_event, preloadPath) =>
    console.error("[startup] preload failed", preloadPath),
  );
  win.webContents.on("did-finish-load", () => {
    markStartup("did-finish-load");
    flushStartupLog();
  });
  win.webContents.on("did-fail-load", (_event, code, description, url) => {
    console.error(`[startup] load failed ${code} ${description} ${url}`);
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, url) => {
    if (url.startsWith(`${APP_SCHEME}://`) || (DEV_URL && url.startsWith(DEV_URL))) return;
    event.preventDefault();
    openExternal(url);
  });

  win.webContents.on("render-process-gone", () => {
    closeAllowed.add(contentsId);
    win.destroy();
  });

  // 有未保存修改时先问渲染进程；它确认后才真正关。
  win.on("close", (event) => {
    if (closeAllowed.has(contentsId)) return;
    if (!dirtyByContents.get(contentsId)) return;
    event.preventDefault();
    win.webContents.send("app:close-request");
  });

  win.on("closed", () => {
    clearTimeout(slowTimer);
    dirtyByContents.delete(contentsId);
    closeAllowed.delete(contentsId);
    shellReadyContents.delete(contentsId);
    if (mainWindow === win) mainWindow = null;
  });

  if (DEV_URL) void win.loadURL(DEV_URL).catch((error) => console.error("[startup] loadURL", error));
  else
    void win
      .loadURL(`${APP_SCHEME}://local/index.html`)
      .catch((error) => console.error("[startup] loadURL", error));

  return win;
}

function fileFromArgv(argv: string[]): string | null {
  const start = app.isPackaged ? 1 : 2;
  for (const arg of argv.slice(start)) {
    if (arg.startsWith("-")) continue;
    if (/\.(md|markdown|mdx|txt)$/i.test(arg)) return path.resolve(arg);
  }
  return null;
}

function openFileInWindow(target: string): void {
  allowExternalFile(target);
  const win = mainWindow ?? createWindow();
  mainWindow = win;

  // 渲染进程还没订阅事件：先记下来，等它的 shell-ready。
  if (!shellReadyContents.has(win.webContents.id)) {
    pendingFile = target;
    return;
  }
  win.webContents.send("app:open-file", target);
}

function describePdfError(error: unknown): string {  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "EACCES":
    case "EPERM":
      return "没有写入该位置的权限";
    case "ENOSPC":
      return "磁盘空间不足";
    case "EBUSY":
      return "目标文件被其他程序占用";
    default:
      return error instanceof Error && error.message ? error.message : "PDF 导出失败";
  }
}

/** 应用级设置存储：`userData/app-state.json`，比 localStorage / IndexedDB 更可备份。 */
function appStateFile(): string {
  return path.join(app.getPath("userData"), "app-state.json");
}

function readAppState(): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(appStateFile(), "utf8"));
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function registerAppIpc(): void {
  ipcMain.on("store:read-sync", (event) => {
    event.returnValue = readAppState();
  });

  ipcMain.handle("store:write", async (_event, patch: Record<string, unknown>) => {
    const next = { ...readAppState(), ...patch };
    await fs.mkdir(path.dirname(appStateFile()), { recursive: true });
    await fs.writeFile(appStateFile(), JSON.stringify(next, null, 2), "utf8");
    return true;
  });

  ipcMain.on("app:dirty", (event, value: boolean) => {
    dirtyByContents.set(event.sender.id, Boolean(value));
  });

  ipcMain.on("app:shell-ready", (event) => {
    shellReadyContents.add(event.sender.id);
    if (!pendingFile) return;
    event.sender.send("app:open-file", pendingFile);
    pendingFile = null;
  });

  ipcMain.on("app:close-reply", (event, ok: boolean) => {
    if (!ok) return;
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return;
    closeAllowed.add(event.sender.id);
    win.close();
  });

  ipcMain.handle("app:new-window", () => {
    mainWindow = createWindow();
    return true;
  });

  ipcMain.handle("menu:state", (_event, state: Partial<MenuState>) => {
    menuState = { ...DEFAULT_MENU_STATE, ...state };
    applyMenu();
    return true;
  });

  ipcMain.handle("pdf:export", async (_event, request) => {
    try {
      const result = await exportPdf(request);
      // 导出结果要能被「打开 / 所在文件夹」使用。
      if (result) allowExternalFile(result.path);
      return result;
    } catch (error) {
      throw new Error(describePdfError(error), { cause: error });
    }
  });

  ipcMain.handle("pdf:preview", async (_event, request) => {
    try {
      return await previewPdf(request);
    } catch (error) {
      throw new Error(describePdfError(error), { cause: error });
    }
  });

  ipcMain.handle("shell:openExternal", (_event, url: string) => {
    openExternal(String(url));
    return true;
  });

  ipcMain.handle("shell:openPath", async (_event, target: string) => {
    assertAllowedPath(String(target));
    await shell.openPath(String(target));
    return true;
  });

  ipcMain.handle("shell:showItemInFolder", (_event, target: string) => {
    shell.showItemInFolder(String(target));
    return true;
  });

  ipcMain.handle("spell:languages", () => session.defaultSession.availableSpellCheckerLanguages);
  ipcMain.handle("pandoc:detect", async (_event, configured?: string) => detectPandoc(configured));

  ipcMain.handle("pandoc:export", async (_event, request) => {
    const result = await exportWithPandoc(request);
    if (result) allowExternalFile(result.path);
    return result;
  });

  ipcMain.handle("spell:set", (_event, list: string[]) => {
    const available = session.defaultSession.availableSpellCheckerLanguages;
    const picked = (Array.isArray(list) ? list : []).filter((code) => available.includes(code));
    if (picked.length > 0) session.defaultSession.setSpellCheckerLanguages(picked);
    return true;
  });
}

function registerAppProtocol(): void {
  protocol.handle(APP_SCHEME, async (request) => {
    const url = new URL(request.url);
    const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const root = rendererRoot();
    const filePath = path.join(root, relative);

    if (!isInsideDir(root, filePath)) {
      return new Response("forbidden", { status: 403 });
    }

    // 不能用 net.fetch(file://…)：打包后资源在 app.asar 里，
    // Chromium 的 file 加载器看不到 asar 虚拟文件系统，会直接白屏。
    // Node 的 fs 有 asar 补丁，所以用 readFile。
    if (STARTUP_LOG) console.log(`[startup] +${Math.round(process.uptime() * 1000)}ms app:// ${relative}`);
    try {
      const data = await fs.readFile(filePath);
      if (STARTUP_LOG) console.log(`[startup] +${Math.round(process.uptime() * 1000)}ms served ${relative} ${data.byteLength}B`);
      const headers = new Headers({
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "Content-Security-Policy": CSP,
      });
      return new Response(new Uint8Array(data), { status: 200, headers });
    } catch (error) {
      if (STARTUP_LOG) console.error(`[startup] read failed ${relative}`, error);
      return new Response("not found", { status: 404 });
    }
  });
}

const gotLock = app.requestSingleInstanceLock();

if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const target = fileFromArgv(argv);
    if (target) {
      openFileInWindow(target);
      return;
    }
    if (!mainWindow) return;
    // 启动还没画完时窗口可能还没可见：这时 focus() 是空操作，用户会以为又没点着。
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  // macOS：Finder 里双击 .md 走这个事件，可能在 ready 之前到达。
  app.on("open-file", (event, filePath) => {
    event.preventDefault();
    if (app.isReady()) openFileInWindow(filePath);
    else void app.whenReady().then(() => openFileInWindow(filePath));
  });

  void app.whenReady().then(() => {
    markStartup("app-ready");
    registerAppProtocol();
    // 窗口状态是几百字节的本地文件：同步读，省掉开窗前的一次异步 I/O。
    windowState = loadWindowState();
    // 先开窗，再做剩下的事。IPC / 菜单 / 白名单都不需要挡在窗口前面。
    mainWindow = createWindow();
    markStartup("window-created");
    registerFileIpc();
    markStartup("file-ipc");
    registerAiIpc();
    registerAppIpc();
    registerUpdaterIpc();
    markStartup("app-ipc");
    applyMenu();
    markStartup("menu-done");
    startUpdater();

    const initial = fileFromArgv(process.argv);
    if (initial) openFileInWindow(initial);

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
