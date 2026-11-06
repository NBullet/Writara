/**
 * 渲染进程的运行日志。
 *
 * 界面崩成白页时，React 树已经没了，页面上没有任何可以点的地方；主进程也只看得到
 * 「窗口还在」。所以这里在 **React 挂载之前** 就装好三件事：
 *
 * - `window.onerror` / `unhandledrejection` → 写进主进程的日志文件；
 * - 操作面包屑（命令 id）→ 卡死 / 崩溃时回答「死之前最后做了什么」；
 * - 心跳 + 紧急重载（F5 / Ctrl+R）→ 不依赖 React 树的逃生口。
 *
 * 日志落在 `userData/logs/writara.log`，见 `electron/app-log.ts`。
 */

let installed = false;

export function reportError(scope: string, error: unknown, extra?: string): void {
  const detail = error instanceof Error ? error : new Error(String(error));
  const stack = [detail.stack, extra].filter(Boolean).join("\n");
  try {
    window.writara?.log({
      level: "error",
      scope,
      message: detail.message || String(error),
      stack,
    });
  } catch {
    // 日志通道本身失败时不能影响界面
  }
}

export function breadcrumb(label: string): void {
  try {
    window.writara?.breadcrumb(label);
  } catch {
    // 同上
  }
}

export function installRuntimeLogging(): void {
  if (installed) return;
  installed = true;

  window.addEventListener("error", (event) => {
    reportError(
      "window",
      event.error ?? event.message,
      `${event.filename}:${event.lineno}:${event.colno}`,
    );
  });

  window.addEventListener("unhandledrejection", (event) => {
    reportError("promise", event.reason);
  });

  // 卡死 / React 崩掉时的逃生口：捕获阶段先于应用快捷键，直接重载。
  window.addEventListener(
    "keydown",
    (event) => {
      if (event.key !== "F5" && !((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      window.location.reload();
    },
    true,
  );

  // 主进程 15 秒收不到心跳就认为界面卡住（只在窗口可见且聚焦时判断）。
  const beat = () => {
    try {
      window.writara?.heartbeat();
    } catch {
      // 忽略
    }
  };
  beat();
  setInterval(beat, 2000);
}
