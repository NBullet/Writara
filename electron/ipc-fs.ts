import { app, BrowserWindow, dialog, ipcMain, shell, type OpenDialogOptions } from "electron";
import { promises as fs } from "node:fs";
import * as fsSync from "node:fs";
import path from "node:path";

import { decodeBuffer, encodeText } from "./encoding";
import type { TextEncoding } from "../src/io/encoding";

/**
 * 文件系统 IPC。
 *
 * 渲染进程只传路径，路径必须来自「用户选过的东西」：
 * 打开/另存对话框、命令行参数、或已授权的工作区根目录。
 * 不要用渲染进程传来的任意路径直接读写——否则一个恶意 `.md`
 * 里的图片地址就能变成任意文件读取。
 */

const MARKDOWN_EXT = /\.(md|markdown|mdx|txt)$/i;
const MD_FILTER = [{ name: "Markdown", extensions: ["md", "markdown", "mdx", "txt"] }];
const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "dev-dist",
  "dist-electron",
  "release",
  ".git",
  ".obsidian",
]);
const MAX_DEPTH = 4;
const MAX_FILES = 300;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".bmp": "image/bmp",
  ".avif": "image/avif",
};

interface ScannedEntry {
  name: string;
  path: string;
  abs: string;
}

const allowedFiles = new Set<string>();
const allowedRoots = new Set<string>();

/**
 * 文件监听：只盯当前文档。
 *
 * 监听**父目录**而不是文件本身：很多编辑器（包括我们的原子写）是
 * 「写临时文件再 rename」，盯着 inode 会在替换后失效。
 */
let currentWatch: { key: string; watcher: fsSync.FSWatcher } | null = null;
const lastWrite = new Map<string, number>();

/** 工作区监听：目录里增删文件（正文 / 资源 / 清单）时通知侧栏刷新。 */
let currentWorkspaceWatch: { key: string; watcher: fsSync.FSWatcher } | null = null;
let workspaceTimer: NodeJS.Timeout | null = null;

function notifyWorkspaceChanged(key: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("app:workspace-changed", key);
  }
}

function watchWorkspace(root: string): void {
  const key = normalize(root);
  if (currentWorkspaceWatch?.key === key) return;

  currentWorkspaceWatch?.watcher.close();
  currentWorkspaceWatch = null;

  try {
    const watcher = fsSync.watch(key, { recursive: true, persistent: false }, (_event, filename) => {
      if (!filename) return;
      const changed = String(filename).replace(/\\/g, "/");
      // 清单改动刷新标题与导出默认值；资源文件增删也要进文件树。
      // `.writara/` 里除清单外的内容（模板 / 提案）拆开刷新没有收益。
      if (changed.startsWith(".writara/") && changed !== ".writara/project.json") return;
      if (workspaceTimer) clearTimeout(workspaceTimer);
      workspaceTimer = setTimeout(() => notifyWorkspaceChanged(key), 250);
    });
    watcher.on("error", () => {
      watcher.close();
      if (currentWorkspaceWatch?.key === key) currentWorkspaceWatch = null;
    });
    currentWorkspaceWatch = { key, watcher };
  } catch {
    // 个别平台不支持 recursive，退化成手动刷新。
  }
}

function notifyFileChanged(key: string): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("app:file-changed", key);
  }
}

function watchDocument(target: string): void {
  const key = normalize(target);
  if (currentWatch?.key === key) return;

  currentWatch?.watcher.close();
  currentWatch = null;

  const name = path.basename(key);
  let watcher: fsSync.FSWatcher;
  try {
    watcher = fsSync.watch(path.dirname(key), { persistent: false }, (_event, filename) => {
      if (!filename || String(filename) !== name) return;
      // 自己的写入（原子替换会产生两次事件）不通知自己。
      if (Date.now() - (lastWrite.get(key) ?? 0) < 800) return;

      // 编辑器保存往往是一串事件，合并一下。
      setTimeout(() => notifyFileChanged(key), 200);
    });
  } catch {
    return;
  }

  watcher.on("error", () => {
    watcher.close();
    if (currentWatch?.key === key) currentWatch = null;
  });
  currentWatch = { key, watcher };
}

function normalize(target: string): string {
  return path.resolve(target);
}

function isInside(root: string, target: string): boolean {
  const r = normalize(root);
  const t = normalize(target);
  return t === r || t.startsWith(`${r}${path.sep}`);
}

function assertInside(root: string, target: string): void {
  if (!isInside(root, target)) throw new Error("路径越界，已阻止访问");
}

function allowFile(target: string): void {
  allowedFiles.add(normalize(target));
  schedulePersistAllowed();
}

function allowRoot(target: string): void {
  allowedRoots.add(normalize(target));
  schedulePersistAllowed();
}

/* ---- 白名单持久化 ----
 *
 * 白名单原本只在内存里：重启后「恢复上次会话」读文件、扫描上次的文件夹都会撞上
 * assertAllowed，界面每次启动都弹「没有访问该文件的权限」。
 * 这里把**用户实际打开过**的路径存到 userData，启动时读回来；文件内容的路径
 * （图片、链接）仍然进不来 —— 白名单只能由对话框、命令行或这几个 restore IPC 添加。
 */

const ALLOW_FILE = "allowed-paths.json";
const MAX_ALLOWED_FILES = 200;
const MAX_ALLOWED_ROOTS = 40;
let persistTimer: NodeJS.Timeout | null = null;

function allowedStatePath(): string {
  return path.join(app.getPath("userData"), ALLOW_FILE);
}

function schedulePersistAllowed(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const payload = JSON.stringify({
      files: [...allowedFiles].slice(-MAX_ALLOWED_FILES),
      roots: [...allowedRoots].slice(-MAX_ALLOWED_ROOTS),
    });
    const target = allowedStatePath();
    const temp = `${target}.${process.pid}.tmp`;
    void fs
      .writeFile(temp, payload, "utf8")
      .then(() => fs.rename(temp, target))
      .catch(() => undefined);
  }, 300);
}

function loadAllowedState(): void {
  try {
    const raw = fsSync.readFileSync(allowedStatePath(), "utf8");
    const parsed = JSON.parse(raw) as { files?: unknown; roots?: unknown };
    // 刻意不在这里做 existsSync：白名单最多 240 条，其中一条落在离线的网络盘或
    // 休眠的 NAS 上，同步 stat 就会把主进程卡住几秒到几十秒 —— 表现是「双击后
    // 很久没有任何窗口」（这条路以前就在 createWindow() 之前）。多留几条已失效的
    // 路径没有副作用：真正读取时不存在会照常报错，写回时也会按上限裁剪。
    const restore = (value: unknown, target: Set<string>) => {
      if (!Array.isArray(value)) return;
      for (const entry of value) {
        if (typeof entry !== "string" || !path.isAbsolute(entry)) continue;
        target.add(normalize(entry));
      }
    };
    restore(parsed.files, allowedFiles);
    restore(parsed.roots, allowedRoots);
  } catch {
    // 首次运行或文件损坏：白名单从空开始，不影响使用
  }
}

/**
 * 恢复上次会话 / 最近列表时重新登记路径。
 *
 * 只接受绝对路径、必须真实存在，单个 Markdown 文件或目录；一次最多 12 条。
 * 不校验调用者身份 —— 渲染进程只会在 restore 流程里调用，且这里**不读文件内容**，
 * 只是把「上次用户确实打开过的路径」放回白名单，下一次 read 仍走同一套 assertAllowed。
 */
function authorizeRestore(targets: unknown): boolean {
  if (!Array.isArray(targets)) return false;
  let added = 0;
  for (const entry of targets.slice(0, 12)) {
    if (typeof entry !== "string" || !path.isAbsolute(entry)) continue;
    let stat: fsSync.Stats;
    try {
      stat = fsSync.statSync(entry);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      allowRoot(entry);
      added += 1;
    } else if (stat.isFile() && MARKDOWN_EXT.test(entry)) {
      allowFile(entry);
      added += 1;
    }
  }
  return added > 0;
}

function assertAllowed(target: string): void {
  const t = normalize(target);
  if (allowedFiles.has(t)) return;
  for (const root of allowedRoots) {
    if (isInside(root, t)) return;
  }
  throw new Error("没有访问该文件的权限");
}

function describeMainError(error: unknown): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  switch (code) {
    case "ENOENT":
      return "文件不存在或已被移动";
    case "EACCES":
    case "EPERM":
      return "没有文件访问权限";
    case "EBUSY":
      return "文件被其他程序占用";
    case "ENOSPC":
      return "磁盘空间不足";
    case "EISDIR":
      return "这是一个文件夹";
    case "ENOTDIR":
      return "路径不是文件夹";
    default:
      if (error instanceof Error && error.message) return error.message;
      return "文件操作失败";
  }
}

function handle(channel: string, fn: (...args: unknown[]) => Promise<unknown>): void {
  ipcMain.handle(channel, async (_event, ...args: unknown[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      throw new Error(describeMainError(error), { cause: error });
    }
  });
}

function markdownName(name: string, fallback = "未命名"): string {
  const trimmed = name.trim() || fallback;
  return /\.(md|markdown|mdx)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

/** 去掉路径分隔符与 Windows 非法字符；重名时补 -1、-2。 */
function safeFileName(name: string): string {
  const base =
    path
      .basename(name)
      // eslint-disable-next-line no-control-regex -- Windows 文件名不允许控制字符
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
      .replace(/^\.+/, "")
      .trim() || "image.png";
  return base;
}

async function uniquePath(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = path.basename(name, ext);
  let candidate = path.join(dir, name);
  for (let index = 1; index < 500; index += 1) {
    try {
      await fs.access(candidate);
      candidate = path.join(dir, `${stem}-${index}${ext}`);
    } catch {
      return candidate;
    }
  }
  return path.join(dir, `${stem}-${Date.now()}${ext}`);
}

/**
 * 原子写：先写同目录临时文件，再 rename 覆盖。
 * 直接写目标文件时，进程被杀/断电会留下半截内容；rename 在同一分区内是原子的。
 * Windows 上目标被占用时 rename 会失败，退回直写，保证「保存」不至于不可用。
 */
async function writeFileAtomic(target: string, data: Buffer | string): Promise<void> {
  const temp = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await fs.writeFile(temp, data);
    await fs.rename(temp, target);
  } catch (error) {
    await fs.unlink(temp).catch(() => undefined);
    if ((error as NodeJS.ErrnoException).code === "EPERM" || (error as NodeJS.ErrnoException).code === "EACCES") {
      await fs.writeFile(target, data);
      return;
    }
    throw error;
  }
}

function parentPath(relPath: string): string {
  return relPath.split("/").slice(0, -1).join("/");
}

async function scanDirectory(
  root: string,
  limits: { depth: number; files: number; include?: string[] } = { depth: MAX_DEPTH, files: MAX_FILES },
  kind: "markdown" | "asset" = "markdown",
): Promise<ScannedEntry[]> {
  const files: ScannedEntry[] = [];
  const maxDepth = Math.max(1, Math.min(12, limits.depth));
  const maxFiles = Math.max(1, Math.min(5000, limits.files));
  const include = new Set(limits.include ?? []);

  async function walk(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth || files.length >= maxFiles) return;

    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name.startsWith(".") && !include.has(entry.name)) continue;

      if (entry.isDirectory()) {
        await walk(path.join(dir, entry.name), `${prefix}${entry.name}/`, depth + 1);
        continue;
      }
      if (!entry.isFile()) continue;
      const markdown = MARKDOWN_EXT.test(entry.name);
      if (kind === "markdown" ? !markdown : markdown) continue;

      files.push({
        name: entry.name,
        path: `${prefix}${entry.name}`,
        abs: path.join(dir, entry.name),
      });
    }
  }

  await walk(root, "", 0);
  return files.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

/** 命令行参数里的文件（`Writara.exe 笔记.md`）也要先授权再让渲染进程读。 */
export function allowExternalFile(target: string): void {
  allowFile(target);
  // 同目录里可能有 `${文档名}.assets/` 与相对路径图片。
  allowRoot(path.dirname(target));
}

/** 给 `shell:openPath` 用：只允许打开授权过的路径（文档、附件、导出结果）。 */
export function assertAllowedPath(target: string): void {
  assertAllowed(target);
}

export function registerFileIpc(): void {
  // 先恢复上次用过的白名单：否则「恢复上次会话」会在第一个 read 上被拦下来。
  loadAllowedState();

  handle("fs:authorizeRestore", async (payload) => authorizeRestore(payload));

  handle("fs:open", async (payload) => {
    // 从当前文档 / 工作区目录打开：Windows 的打开对话框没有「上次目录」时
    // 会停在任意位置，用户只好把相对路径粘进文件名框，结果报「文件名无效」。
    const { defaultPath } = (payload ?? {}) as { defaultPath?: unknown };
    const initial =
      typeof defaultPath === "string" && path.isAbsolute(defaultPath) ? defaultPath : undefined;
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: MD_FILTER,
      ...(initial ? { defaultPath: initial } : {}),
    });
    const file = result.filePaths[0];
    if (result.canceled || !file) return null;

    allowFile(file);
    // 允许读写所在目录：相对路径图片和 `${文档名}.assets/` 都在这里。
    allowRoot(path.dirname(file));
    app.addRecentDocument(file);
    watchDocument(file);
    const content = decodeBuffer(await fs.readFile(file));
    return { path: file, name: path.basename(file), ...content };
  });

  handle("fs:read", async (target) => {
    const file = String(target);
    assertAllowed(file);
    allowRoot(path.dirname(file));
    watchDocument(file);
    try {
      return decodeBuffer(await fs.readFile(file));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  });

  handle("fs:save", async (payload) => {
    const request = payload as {
      text: string;
      suggestedName: string;
      ref?: string | null;
      forcePicker?: boolean;
      encoding?: TextEncoding;
      bom?: boolean;
    };
    const useExisting = !request.forcePicker && Boolean(request.ref);

    let target: string;
    if (useExisting && request.ref) {
      target = request.ref;
      assertAllowed(target);
    } else {
      const result = await dialog.showSaveDialog({
        defaultPath: markdownName(request.suggestedName),
        filters: MD_FILTER,
      });
      if (result.canceled || !result.filePath) return null;
      target = result.filePath;
    }

    const data = encodeText(request.text, request.encoding ?? "utf8", request.bom === true);
    await writeFileAtomic(target, data);
    lastWrite.set(normalize(target), Date.now());
    allowFile(target);
    allowRoot(path.dirname(target));
    app.addRecentDocument(target);
    watchDocument(target);
    return { name: path.basename(target), path: target };
  });

  handle("fs:write", async (payload) => {
    const {
      path: target,
      text,
      encoding,
      bom,
    } = payload as { path: string; text: string; encoding?: TextEncoding; bom?: boolean };
    assertAllowed(target);
    await writeFileAtomic(target, encodeText(text, encoding ?? "utf8", bom === true));
    lastWrite.set(normalize(target), Date.now());
    return true;
  });

  handle("fs:chooseFolder", async (options) => {
    const { mode } = (options ?? {}) as { mode?: "read" | "readwrite" };
    const properties: OpenDialogOptions["properties"] = ["openDirectory"];
    if (mode !== "read") properties.push("createDirectory");

    const result = await dialog.showOpenDialog({ properties });
    const root = result.filePaths[0];
    if (result.canceled || !root) return null;

    allowRoot(root);
    return { name: path.basename(root), path: root };
  });

  handle("fs:scan", async (payload) => {
    const { root, limits } = (payload ?? {}) as {
      root: string;
      limits?: { depth: number; files: number };
    };
    assertAllowed(root);
    watchWorkspace(root);
    return scanDirectory(root, limits);
  });

  handle("fs:scanAssets", async (payload) => {
    const { root, limits } = (payload ?? {}) as {
      root: string;
      limits?: { depth: number; files: number };
    };
    assertAllowed(root);
    return scanDirectory(root, limits, "asset");
  });

  /** 工作区内的配置文件：只允许根目录内的相对路径。 */
  handle("fs:readRootFile", async (payload) => {
    const { root, path: relPath } = payload as { root: string; path: string };
    assertAllowed(root);
    const abs = path.resolve(root, relPath);
    assertInside(root, abs);
    try {
      return decodeBuffer(await fs.readFile(abs));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  });

  handle("fs:writeRootFile", async (payload) => {
    const { root, path: relPath, text } = payload as { root: string; path: string; text: string };
    assertAllowed(root);
    const abs = path.resolve(root, relPath);
    assertInside(root, abs);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await writeFileAtomic(abs, text);
    return true;
  });

  handle("fs:createRootDir", async (payload) => {
    const { root, path: relPath } = payload as { root: string; path: string };
    assertAllowed(root);
    const abs = path.resolve(root, relPath);
    assertInside(root, abs);
    await fs.mkdir(abs, { recursive: true });
    return true;
  });

  handle("fs:createFile", async (payload) => {
    const { root, name } = payload as { root: string; name: string };
    assertAllowed(root);
    const fileName = markdownName(name);
    const abs = path.join(root, fileName);
    assertInside(root, abs);
    // 别静默覆盖已有文件（新建同名会把内容清空，属于数据丢失）。
    const exists = await fs.access(abs).then(
      () => true,
      () => false,
    );
    if (exists) throw new Error(`已经有同名文件：${fileName}`);
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, `# ${path.basename(fileName).replace(/\.md$/i, "")}\n\n`, "utf8");
    allowFile(abs);
    return {
      name: path.basename(abs),
      path: path.relative(root, abs).split(path.sep).join("/"),
      abs,
    };
  });

  handle("fs:restoreFile", async (payload) => {
    const { root, path: target, text } = payload as { root: string; path: string; text: string };
    assertAllowed(root);
    const abs = path.resolve(root, target);
    assertInside(root, abs);
    const exists = await fs.access(abs).then(
      () => true,
      () => false,
    );
    if (exists) throw new Error("目标位置已经有同名文件");
    await fs.mkdir(path.dirname(abs), { recursive: true });
    await fs.writeFile(abs, text, "utf8");
    allowFile(abs);
    return {
      name: path.basename(abs),
      path: path.relative(root, abs).split(path.sep).join("/"),
      abs,
    };
  });

  handle("fs:rename", async (payload) => {
    const { root, from, name } = payload as { root: string; from: string; name: string };
    assertAllowed(root);
    const nextName = markdownName(name);
    const fromAbs = path.resolve(root, from);
    const toAbs = path.join(root, parentPath(from), nextName);
    assertInside(root, fromAbs);
    assertInside(root, toAbs);

    await fs.rename(fromAbs, toAbs);
    allowFile(toAbs);
    return {
      name: nextName,
      path: parentPath(from) ? `${parentPath(from)}/${nextName}` : nextName,
      abs: toAbs,
    };
  });

  handle("fs:delete", async (payload) => {
    const { root, path: relPath } = payload as { root: string; path: string };
    assertAllowed(root);
    const abs = path.resolve(root, relPath);
    assertInside(root, abs);
    await fs.unlink(abs);
    allowedFiles.delete(normalize(abs));
    return true;
  });

  handle("fs:readImage", async (payload) => {
    const { root, path: relPath } = payload as { root: string; path: string };
    assertAllowed(root);
    const abs = path.resolve(root, relPath);
    assertInside(root, abs);

    const buffer = await fs.readFile(abs);
    const mime = MIME[path.extname(abs).toLowerCase()] ?? "application/octet-stream";
    return `data:${mime};base64,${buffer.toString("base64")}`;
  });

  /**
   * 把拖入/粘贴的图片按设置存到指定位置。
   * 目标目录由 `options.target` 决定；`path` 返回要写进 Markdown 的地址。
   * `docPath` 为空表示文档还没保存：附件落到应用数据目录，路径按绝对路径写入。
   */
  handle("fs:saveImage", async (payload) => {
    const { docPath, options, fileName, data } = payload as {
      docPath: string;
      options: { target: "assets" | "current" | "path"; path?: string; relative: boolean };
      fileName: string;
      data: Uint8Array;
    };
    const hasDoc = Boolean(docPath);
    if (hasDoc) assertAllowed(docPath);

    const docDir = hasDoc ? path.dirname(docPath) : "";
    const stem = hasDoc ? path.basename(docPath, path.extname(docPath)) : "";

    let dir: string;
    if (!hasDoc) {
      // 文档还没有磁盘位置：放到应用数据目录，避免在用户家目录里乱写。
      dir = path.join(app.getPath("userData"), "attachments");
    } else if (options.target === "assets") {
      dir = path.join(docDir, `${stem}.assets`);
      assertInside(docDir, dir);
    } else if (options.target === "current") {
      dir = docDir;
    } else {
      const custom = (options.path ?? "").trim();
      if (!custom) throw new Error("还没有设置图片保存路径");
      dir = path.isAbsolute(custom) ? custom : path.join(docDir, custom);
    }

    await fs.mkdir(dir, { recursive: true });
    const target = await uniquePath(dir, safeFileName(fileName));
    await fs.writeFile(target, Buffer.from(data));
    allowRoot(dir);

    const inserted =
      hasDoc && options.relative
        ? path.relative(docDir, target).split(path.sep).join("/")
        : target.split(path.sep).join("/");
    return { path: inserted, absolute: target };
  });

  handle("fs:reveal", async (target) => {
    const file = String(target);
    assertAllowed(file);
    shell.showItemInFolder(file);
    return true;
  });
}
