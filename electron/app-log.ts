import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";

import { app } from "electron";

import { describeError, formatLogLine } from "./log-format";

/**
 * 运行日志。
 *
 * 以前只有 `startup.log`（要手动开 `WRITARA_STARTUP_LOG=1`）和 `updater.log`，
 * 界面崩成白页 / 卡死时没有任何线索。这里把主进程、渲染进程的错误、控制台告警、
 * 渲染进程崩溃与「心跳停了」都写到 `userData/logs/writara.log`：
 *
 * - 只留一份旧日志（`writara.log.1`），超过 2MB 轮转；
 * - 同步追加：崩溃现场（尤其主进程 uncaughtException）也要能落盘；
 * - 写日志失败绝不能影响应用本身，全部 `try/catch` 吞掉。
 */

const MAX_BYTES = 2 * 1024 * 1024;

let target: string | null = null;

export function logDir(): string {
  return path.join(app.getPath("userData"), "logs");
}

export function logFile(): string {
  return path.join(logDir(), "writara.log");
}

export function initLog(): void {
  try {
    const file = logFile();
    mkdirSync(logDir(), { recursive: true });
    if (existsSync(file) && statSync(file).size > MAX_BYTES) {
      const backup = `${file}.1`;
      rmSync(backup, { force: true });
      renameSync(file, backup);
    }
    target = file;
    log(
      "main",
      `启动 v${app.getVersion()} · Electron ${process.versions.electron} · ${process.platform} ${process.arch}`,
    );
  } catch {
    target = null;
  }
}

export function log(scope: string, message: string): void {
  if (!target) return;
  try {
    appendFileSync(target, `${formatLogLine(scope, message)}\n`, "utf8");
  } catch {
    // 磁盘满 / 权限不足：日志本身不能把应用拖垮
  }
}

export function logError(scope: string, error: unknown): void {
  log(scope, describeError(error));
}
