import { app, BrowserWindow, ipcMain } from "electron";
import type { AppUpdater, UpdateInfo } from "electron-updater";
import { promises as fs } from "node:fs";
import path from "node:path";

import type { UpdateStatus } from "../src/updates/types";

/**
 * 在线更新（GitHub Releases）。
 *
 * - 只对打包后的 NSIS 安装版生效；portable 单文件 exe 没有更新能力。
 * - 启动 8 秒后静默检查一次，**不自动下载**；是否下载由用户在横幅里点。
 * - 下载完成后由用户点「重启并安装」；关窗时也会自动装（`autoInstallOnAppQuit`）。
 * - `electron-updater` 按需加载：它只在这 8 秒之后才需要，不该占启动时间。
 * - 安装包未签名，构建配置里对应 `win.verifyUpdateCodeSignature: false`；
 *   签名之后要把它删掉，让更新校验发布者。
 * - 开发时用 `WRITARA_FORCE_UPDATE=1` + 项目根目录的 `dev-app-update.yml` 试。
 */

type UpdaterModule = { autoUpdater: AppUpdater };

let loaded: Promise<UpdaterModule> | null = null;
let wired = false;
let state: UpdateStatus = { state: "idle" };
/** 这次检查是不是用户手动点的：只影响错误的呈现（静默检查失败不打扰）。 */
let manual = false;

function logFile(): string {
  return path.join(app.getPath("userData"), "updater.log");
}

function writeLog(line: string): void {
  void fs.appendFile(logFile(), `${new Date().toISOString()} ${line}\n`, "utf8").catch(() => undefined);
}

function publish(next: UpdateStatus): void {
  state = next;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send("updates:status", next);
  }
}

/** 更新说明可能是字符串或分条结构；横幅只关心一行纯文本。 */
function notesOf(info: UpdateInfo): string {
  if (!info.releaseNotes) return "";
  const text =
    typeof info.releaseNotes === "string"
      ? info.releaseNotes
      : info.releaseNotes.map((entry) => entry.note ?? "").join("\n");
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function fail(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  writeLog(`error ${message}`);
  publish({ state: "error", message, manual });
  manual = false;
}

function wire(autoUpdater: AppUpdater): void {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.logger = {
    info: (message?: unknown) => writeLog(`info ${String(message)}`),
    warn: (message?: unknown) => writeLog(`warn ${String(message)}`),
    error: (message?: unknown) => writeLog(`error ${String(message)}`),
    debug: (message?: unknown) => writeLog(`debug ${String(message)}`),
  };

  autoUpdater.on("checking-for-update", () => publish({ state: "checking" }));
  autoUpdater.on("update-available", (info) => {
    publish({ state: "available", version: info.version, notes: notesOf(info) });
    manual = false;
  });
  autoUpdater.on("update-not-available", () => {
    publish({ state: "none" });
    manual = false;
  });
  autoUpdater.on("download-progress", (progress) => {
    if (state.state !== "downloading") return;
    const percent = Math.round(progress.percent);
    if (percent === state.percent) return;
    publish({ state: "downloading", version: state.version, percent });
  });
  autoUpdater.on("update-downloaded", (info) => publish({ state: "downloaded", version: info.version }));
  autoUpdater.on("error", (error) => fail(error));
}

async function loadUpdater(): Promise<AppUpdater> {
  loaded ??= import("electron-updater");
  const module = await loaded;
  if (!wired) {
    wired = true;
    wire(module.autoUpdater);
    // 日志只留最近 512KB，避免无限增长。
    void fs
      .stat(logFile())
      .then((info) => (info.size > 512 * 1024 ? fs.writeFile(logFile(), "", "utf8") : undefined))
      .catch(() => undefined);
  }
  return module.autoUpdater;
}

async function check(byUser: boolean): Promise<void> {
  manual = byUser;
  try {
    const autoUpdater = await loadUpdater();
    await autoUpdater.checkForUpdates();
  } catch (error) {
    fail(error);
  }
}

export function registerUpdaterIpc(): void {
  ipcMain.handle("updates:status", () => state);
  ipcMain.handle("updates:check", async () => {
    await check(true);
    return state;
  });
  ipcMain.handle("updates:download", async () => {
    if (state.state !== "available") return false;
    publish({ state: "downloading", version: state.version, percent: 0 });
    try {
      const autoUpdater = await loadUpdater();
      await autoUpdater.downloadUpdate();
    } catch (error) {
      fail(error);
    }
    return true;
  });
  ipcMain.handle("updates:install", async () => {
    if (state.state !== "downloaded") return false;
    const autoUpdater = await loadUpdater();
    autoUpdater.quitAndInstall(true, true);
    return true;
  });
}

export function startUpdater(): void {
  const forced = process.env.WRITARA_FORCE_UPDATE === "1";
  if (!app.isPackaged && !forced) return;

  // 不挡开窗：延迟到窗口和编辑器都稳定之后再打这一次网络请求。
  setTimeout(() => {
    if (state.state !== "idle") return;
    void (async () => {
      const autoUpdater = await loadUpdater();
      if (forced) autoUpdater.forceDevUpdateConfig = true;
      await check(false);
    })().catch(fail);
  }, 8000);
}
