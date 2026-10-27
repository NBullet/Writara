/**
 * 文档文本编码。
 *
 * 主进程用 iconv-lite 真正解码 / 编码（见 `electron/encoding.ts`）；
 * 这里只放两边共用的类型与显示名。
 *
 * 为什么要做：Typora 能按 BOM / 内容判断 GBK，并在保存时写回原编码；
 * 我们之前一律按 UTF-8 读写，GBK 文件一打开就是乱码，保存还会把原文写坏。
 */

export type TextEncoding = "utf8" | "utf16le" | "utf16be" | "gb18030";

export interface TextFormat {
  encoding: TextEncoding;
  /** 是否写 BOM（只在原文件有 BOM 时保留）。 */
  bom: boolean;
}

export interface TextContent extends TextFormat {
  text: string;
}

/** 新文档、以及浏览器端的固定格式。 */
export const DEFAULT_FORMAT: TextFormat = { encoding: "utf8", bom: false };

const LABELS: Record<TextEncoding, string> = {
  utf8: "UTF-8",
  utf16le: "UTF-16 LE",
  utf16be: "UTF-16 BE",
  gb18030: "GB18030",
};

/** 状态栏显示用：带 BOM 时注明，`UTF-8` 之类不显眼的编码也照常返回。 */
export function formatLabel(format: TextFormat): string {
  return `${LABELS[format.encoding]}${format.bom ? " BOM" : ""}`;
}

export function isDefaultFormat(format: TextFormat): boolean {
  return format.encoding === "utf8" && !format.bom;
}
