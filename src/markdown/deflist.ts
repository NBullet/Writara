/**
 * 定义列表（Typora / Pandoc 风格）：
 *
 * ```
 * 术语
 * : 解释
 * : 另一种解释
 * ```
 *
 * CommonMark 没有这个语法，Lezer 会把它解析成一个两行以上的普通段落，
 * 所以判定只能按「段落里的行形状」来做。编辑器与打印共用这里的实现，
 * 否则会出现「编辑器认、导出不认」（与 `==高亮==` 是同一类坑）。
 */

export interface DefinitionList {
  term: string;
  details: string[];
}

/** `: ` / `:   ` 这类定义行的前缀长度（0 表示不是定义行）。 */
export function definitionMarker(line: string): number {
  const match = /^ {0,3}:[ \t]+/.exec(line);
  return match ? match[0].length : 0;
}

/** 段落文本 → 定义列表；形状不对时返回 null（按普通段落渲染）。 */
export function parseDefinitionList(text: string): DefinitionList | null {
  const lines = text.replace(/\n+$/, "").split("\n");
  if (lines.length < 2) return null;

  const term = (lines[0] ?? "").trim();
  // 术语自己不能是定义行；空术语（`: 解释` 开头）留给普通段落。
  if (!term || definitionMarker(term) > 0) return null;

  const details: string[] = [];
  for (const line of lines.slice(1)) {
    const marker = definitionMarker(line);
    if (marker === 0) return null;
    details.push(line.slice(marker).trim());
  }

  return details.length > 0 ? { term, details } : null;
}
