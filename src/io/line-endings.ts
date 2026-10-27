/** 换行符：打开时归一成 LF 编辑，保存时按文件原来的风格写回。 */

export type LineEnding = "lf" | "crlf";

export function detectLineEnding(text: string): LineEnding {
  return text.includes("\r\n") ? "crlf" : "lf";
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function applyLineEnding(text: string, ending: LineEnding): string {
  return ending === "crlf" ? text.replace(/\n/g, "\r\n") : text;
}
