/**
 * YAML Front Matter（文档顶部的 `---` 块）。
 * Typora 在预览里隐藏它，导出时不输出；这里做同样的处理。
 */

export interface FrontMatter {
  /** 包含首尾分隔线在内的区间 [0, to)。 */
  from: number;
  to: number;
  /** 去掉 front matter 之后的正文。 */
  body: string;
  /** 从 `title:` 里读到的标题，可为空。 */
  title: string;
}

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseFrontMatter(source: string): FrontMatter | null {
  const match = FRONT_MATTER.exec(source);
  if (!match) return null;

  const raw = match[1] ?? "";
  const titleMatch = /^title[ \t]*:[ \t]*(.+)$/m.exec(raw);
  const title = titleMatch ? titleMatch[1]!.trim().replace(/^['"]|['"]$/g, "") : "";

  return {
    from: 0,
    to: match[0].length,
    body: source.slice(match[0].length),
    title,
  };
}
