/**
 * 日志行的格式化（纯函数，不依赖 electron，方便单测）。
 *
 * 主进程与渲染进程的错误都走同一份格式，排查时按时间排序即可。
 */

export function formatLogLine(scope: string, message: string, at: Date = new Date()): string {
  return `${at.toISOString()} [${scope}] ${message}`;
}

export function describeError(error: unknown): string {
  if (error instanceof Error) {
    const stack = error.stack ? `\n${error.stack}` : "";
    return `${error.name}: ${error.message}${stack}`;
  }
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
