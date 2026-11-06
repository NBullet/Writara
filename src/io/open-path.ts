/**
 * 「按路径打开」的输入清洗。
 *
 * 原生文件对话框只认平台自己的路径写法：从聊天、代码宿主或文档里复制来的
 * `E:/a/b.md`、带引号 / 零宽空格的路径粘进「文件名」框，Windows 会报
 * 「文件名无效」。这里把常见形态统一成平台绝对路径，再交给主进程读取。
 */

/** 聊天 / 网页里复制路径时常混进来的不可见字符。 */
const INVISIBLE = /[\u200b-\u200f\u202a-\u202e\u2060\ufeff]/g;

const WRAPPERS: Array<[string, string]> = [
  ['"', '"'],
  ["'", "'"],
  ["“", "”"],
  ["‘", "’"],
  ["「", "」"],
  ["『", "』"],
  ["`", "`"],
];

/** 句末标点：从一段话里连路径一起复制时很常见。 */
const TRAILING_PUNCTUATION = /[。，、；;]+$/;

/** 应用能打开的文档扩展名（与主进程 `MARKDOWN_EXT` 同一口径）。 */
export const DOCUMENT_EXT = /\.(md|markdown|mdx|txt)$/i;

const DRIVE = /^[a-zA-Z]:/;

export interface OpenPathContext {
  /** 当前文档的绝对路径：相对路径以它所在目录为基准。 */
  base?: string | null;
  /** 没有当前文档时，相对路径以工作区根目录为基准。 */
  root?: string | null;
}

function stripWrapping(input: string): string {
  let text = input.trim();
  for (let round = 0; round < 3; round += 1) {
    const pair = WRAPPERS.find(
      ([open, close]) =>
        text.length > open.length + close.length && text.startsWith(open) && text.endsWith(close),
    );
    if (!pair) break;
    text = text.slice(pair[0].length, text.length - pair[1].length).trim();
  }
  return text;
}

function isAbsolute(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("\\\\") || value.startsWith("/");
}

function dirname(value: string): string {
  const cut = Math.max(value.lastIndexOf("/"), value.lastIndexOf("\\"));
  return cut > 0 ? value.slice(0, cut) : value;
}

/** 把 `.` / `..` 与重复分隔符压平，保留盘符 / UNC 前缀。 */
function collapse(value: string): string {
  const windows = DRIVE.test(value) || value.includes("\\");
  const parts: string[] = [];

  if (windows) {
    const unc = value.startsWith("\\\\");
    const drive = DRIVE.exec(value)?.[0] ?? "";
    for (const part of value.slice(unc ? 2 : drive.length).split(/[\\/]+/)) {
      if (!part || part === ".") continue;
      if (part === "..") {
        parts.pop();
        continue;
      }
      parts.push(part);
    }
    const prefix = unc ? "\\\\" : drive ? `${drive}\\` : "";
    return prefix + parts.join("\\");
  }

  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return `/${parts.join("/")}`;
}

/**
 * 返回平台绝对路径；输入既不是绝对路径、又没有可用的基准目录时返回 null。
 * 不校验文件是否存在（由主进程读盘时报错），只负责把写法弄对。
 */
export function normalizeOpenPath(input: string, context: OpenPathContext = {}): string | null {
  if (typeof input !== "string") return null;
  let text = stripWrapping(input.replace(INVISIBLE, ""));
  if (!text) return null;

  // file:///E:/a/b.md → E:/a/b.md（浏览器地址栏 / 拖拽会给这种写法）
  if (/^file:\/\//i.test(text)) {
    text = text.replace(/^file:\/\//i, "");
    try {
      text = decodeURIComponent(text);
    } catch {
      // 不是合法的百分号转义就按原样处理
    }
    if (/^\/[a-zA-Z]:/.test(text)) text = text.slice(1);
  }

  // `//nas/share/a.md` 是 UNC 的另一种写法，先归一成双反斜杠。
  if (text.startsWith("//") && !text.startsWith("///")) text = text.replace(/\//g, "\\");

  if (DRIVE.test(text) || text.startsWith("\\\\") || text.includes("\\")) {
    text = text.replace(/\//g, "\\");
  }

  if (!DOCUMENT_EXT.test(text)) {
    const trimmed = text.replace(TRAILING_PUNCTUATION, "");
    if (trimmed !== text && DOCUMENT_EXT.test(trimmed)) text = trimmed;
  }

  if (!isAbsolute(text)) {
    const base = typeof context.base === "string" && context.base ? context.base : null;
    const root = typeof context.root === "string" && context.root ? context.root : null;
    const anchor = base ?? root;
    if (!anchor) return null;
    const directory = base ? dirname(anchor) : anchor.replace(/[\\/]+$/, "");
    const separator = anchor.includes("\\") || DRIVE.test(anchor) ? "\\" : "/";
    text = [directory.replace(/[\\/]+$/, ""), text].join(separator);
  }

  return collapse(text);
}
