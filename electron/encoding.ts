import iconv from "iconv-lite";

import type { TextContent, TextEncoding } from "../src/io/encoding";

/**
 * 读写文件时的编码判断（只有主进程用）。
 *
 * 规则（与 Typora 的行为对齐）：
 * 1. 有 BOM：按 BOM 判定（UTF-8 / UTF-16 LE / UTF-16 BE），保存时写回同一个 BOM；
 * 2. 没有 BOM：先按**严格** UTF-8 解码，失败退回 GB18030（GBK 的超集）；
 * 3. 其余情况一律 UTF-8。
 *
 * 为什么不用「看起来像 GBK」来猜：中文 UTF-8 的字节序列也有大量高位字节，
 * 猜错会把正常文件读成乱码。严格 UTF-8 校验足够把两者分开。
 */

const BOM_UTF8 = [0xef, 0xbb, 0xbf] as const;
const BOM_LE = [0xff, 0xfe] as const;
const BOM_BE = [0xfe, 0xff] as const;

function startsWith(buffer: Uint8Array, prefix: readonly number[]): boolean {
  if (buffer.length < prefix.length) return false;
  return prefix.every((byte, index) => buffer[index] === byte);
}

function isUtf8(buffer: Uint8Array): boolean {
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    return true;
  } catch {
    return false;
  }
}

/** 二进制 → 文本 + 编码。空文件按 UTF-8 处理。 */
export function decodeBuffer(buffer: Buffer): TextContent {
  if (startsWith(buffer, BOM_UTF8)) {
    return { text: iconv.decode(buffer.subarray(3), "utf8"), encoding: "utf8", bom: true };
  }
  if (startsWith(buffer, BOM_LE)) {
    return { text: iconv.decode(buffer.subarray(2), "utf16-le"), encoding: "utf16le", bom: true };
  }
  if (startsWith(buffer, BOM_BE)) {
    return { text: iconv.decode(buffer.subarray(2), "utf16-be"), encoding: "utf16be", bom: true };
  }
  if (isUtf8(buffer)) {
    return { text: iconv.decode(buffer, "utf8"), encoding: "utf8", bom: false };
  }
  return { text: iconv.decode(buffer, "gb18030"), encoding: "gb18030", bom: false };
}

const ICONV_NAME: Record<TextEncoding, string> = {
  utf8: "utf8",
  utf16le: "utf16-le",
  utf16be: "utf16-be",
  gb18030: "gb18030",
};

const BOM_BYTES: Record<TextEncoding, readonly number[]> = {
  utf8: BOM_UTF8,
  utf16le: BOM_LE,
  utf16be: BOM_BE,
  gb18030: [],
};

/** 文本 → 二进制，保留原编码与 BOM。 */
export function encodeText(text: string, encoding: TextEncoding, bom: boolean): Buffer {
  const body = iconv.encode(text, ICONV_NAME[encoding]);
  if (!bom) return body;
  const prefix = BOM_BYTES[encoding];
  if (prefix.length === 0) return body;
  return Buffer.concat([Buffer.from(prefix), body]);
}

/** 猜出编码之后，状态栏与「另存为」都用它。 */
export function encodeContent(content: TextContent): Buffer {
  return encodeText(content.text, content.encoding, content.bom);
}
