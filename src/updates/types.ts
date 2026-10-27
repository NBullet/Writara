/**
 * 在线更新的状态。
 *
 * 主进程（electron/updater.ts）是唯一生产方，渲染进程只读。
 * 不用 `idle` 以外的空状态表达“没查过”：启动后 8 秒会做一次静默检查，
 * 之前横幅不出现。
 */
export type UpdateStatus =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "available"; version: string; notes: string }
  | { state: "none" }
  | { state: "downloading"; version: string; percent: number }
  | { state: "downloaded"; version: string }
  | { state: "error"; message: string; manual: boolean };

/** 横幅要显示的状态（其余状态不占界面）。 */
export function isVisibleStatus(status: UpdateStatus): boolean {
  return status.state === "available" || status.state === "downloading" || status.state === "downloaded";
}
