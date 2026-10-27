/**
 * 图片尺寸语法：`![alt](src =320x200)`（Typora 的写法）。
 * 只识别结尾的 `=宽x高`，URL 里其余部分原样保留。
 */
export interface ImageTarget {
  src: string;
  width?: number;
  height?: number;
}

export function parseImageTarget(raw: string): ImageTarget {
  const text = raw.trim();
  const match = /^(.*?)[ \t]+=[ \t]*(?:(\d+)[ \t]*x[ \t]*(\d+)|(\d+)x?)[ \t]*$/.exec(text);
  if (!match) return { src: text };

  const src = (match[1] ?? "").trim();
  if (!src) return { src: text };

  const width = Number(match[2] ?? match[4] ?? 0) || undefined;
  const height = Number(match[3] ?? 0) || undefined;
  return { src, width, height };
}
