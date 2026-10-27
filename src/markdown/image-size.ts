/**
 * Typora 的图片尺寸写法：`![alt](src =320x200)`。
 *
 * 注意：CommonMark 的链接目标里不允许空格，所以 `![x](a.png =1x1)` 不会被解析成图片。
 * 这里用「解析前把这种写法换成 <img>」的方式补上（导出侧），
 * 编辑器侧则在 analyze 里按行扫描。两处共用下面的正则与取值逻辑。
 */

import { parseImageTarget } from "./image-target";

export interface SizedImage {
  start: number;
  end: number;
  alt: string;
  src: string;
  width?: number;
  height?: number;
}

export const SIZED_IMAGE = /!\[([^\]]*)\]\(([^)\s]+)[ \t]+=[ \t]*(?:(\d+)[ \t]*x[ \t]*(\d+)|(\d+)x?)\)/g;

export function findSizedImagesInLine(line: string): SizedImage[] {
  const found: SizedImage[] = [];
  for (const match of line.matchAll(SIZED_IMAGE)) {
    const index = match.index ?? 0;
    const width = Number(match[3] ?? match[5] ?? 0) || undefined;
    const height = Number(match[4] ?? 0) || undefined;
    found.push({
      start: index,
      end: index + match[0].length,
      alt: match[1] ?? "",
      src: match[2] ?? "",
      width,
      height,
    });
  }
  return found;
}

function escapeAttr(value: string): string {
  return value.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return "&quot;";
    }
  });
}

function replaceInLine(line: string): string {
  // 以行内代码为界切开，只处理代码之外的片段。
  return line
    .split(/(`+[^`]*`+)/g)
    .map((part, index) =>
      index % 2 === 1
        ? part
        : part.replace(SIZED_IMAGE, (_whole, alt: string, src: string, w?: string, h?: string, w2?: string) => {
            const width = w ?? w2;
            const height = h;
            const size = `${width ? ` width="${width}"` : ""}${height ? ` height="${height}"` : ""}`;
            return `<img src="${escapeAttr(src)}"${alt ? ` alt="${escapeAttr(alt)}"` : ' alt=""'}${size}>`;
          }),
    )
    .join("");
}

/** 把带尺寸的图片写法换成内联 HTML；跳过围栏代码块与行内代码。 */
export function replaceSizedImages(source: string): string {
  let inFence = false;
  return source
    .split("\n")
    .map((line) => {
      if (/^\s*(?:```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      return inFence ? line : replaceInLine(line);
    })
    .join("\n");
}

/**
 * 改一张图片的宽度：保留 alt 与 src，把结尾的尺寸换成 `=宽`。
 *
 * 拖拽缩放与浮条共用这一条改写（都是 `=宽` 语义）。
 * 有 title 的写法（`![a](x "t")`）不接受尺寸语法，原样返回，调用方据此不给手柄。
 */
export function withImageWidth(raw: string, width: number): string {
  const trimmed = raw.trim();
  const match = /^(!\[[^\]]*\]\()([^)]*)\)$/.exec(trimmed);
  if (!match) return raw;

  const head = match[1] ?? "";
  const body = match[2] ?? "";
  if (/["']/.test(body)) return raw;

  const target = parseImageTarget(body);
  if (!target.src) return raw;
  return `${head}${target.src} =${Math.max(1, Math.round(width))})`;
}
