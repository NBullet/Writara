/**
 * 查找/替换的匹配逻辑（纯函数）。
 *
 * CodeMirror 自带搜索面板只能搜整篇文档，没有「仅在选区内」。
 * 这里把匹配算法独立出来，面板只负责展示与派发。
 */

export interface FindScope {
  from: number;
  to: number;
}

export interface FindMatch {
  from: number;
  to: number;
}

export interface FindOptions {
  caseSensitive?: boolean;
  regex?: boolean;
  /** 全词匹配：前后不能紧挨英文字母/数字/下划线。 */
  wholeWord?: boolean;
  /** 只在 [from, to) 内匹配。 */
  scope?: FindScope | null;
}

function isWordChar(char: string | undefined): boolean {
  return Boolean(char && /[A-Za-z0-9_]/.test(char));
}

function clampScope(text: string, scope: FindScope | null | undefined): FindScope {
  if (!scope) return { from: 0, to: text.length };
  const from = Math.max(0, Math.min(scope.from, text.length));
  const to = Math.max(from, Math.min(scope.to, text.length));
  return { from, to };
}

/** 返回按位置升序、互不重叠的匹配。 */
export function findMatches(text: string, query: string, options: FindOptions = {}): FindMatch[] {
  if (!query) return [];
  const { from: start, to: end } = clampScope(text, options.scope);
  const body = text.slice(start, end);

  if (!options.regex) {
    const needle = options.caseSensitive ? query : query.toLowerCase();
    const haystack = options.caseSensitive ? body : body.toLowerCase();
    const matches: FindMatch[] = [];
    let index = 0;
    while (index <= haystack.length - needle.length) {
      const found = haystack.indexOf(needle, index);
      if (found < 0) break;
      if (
        options.wholeWord &&
        (isWordChar(body[found - 1]) || isWordChar(body[found + needle.length]))
      ) {
        index = found + 1;
        continue;
      }
      matches.push({ from: start + found, to: start + found + needle.length });
      index = found + Math.max(1, needle.length);
    }
    return matches;
  }

  let pattern: RegExp;
  try {
    pattern = new RegExp(query, options.caseSensitive ? "g" : "gi");
  } catch {
    return [];
  }

  const matches: FindMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(body)) !== null) {
    if (match[0].length === 0) {
      // 零宽匹配：手动推进，避免死循环。
      pattern.lastIndex += 1;
      continue;
    }
    if (
      options.wholeWord &&
      (isWordChar(body[match.index - 1]) || isWordChar(body[match.index + match[0].length]))
    ) {
      continue;
    }
    matches.push({ from: start + match.index, to: start + match.index + match[0].length });
  }
  return matches;
}

/**
 * 单个匹配的替换文本。正则模式保留 $1 / $& 这类替换语法。
 */
export function replacementFor(
  text: string,
  match: FindMatch,
  query: string,
  options: FindOptions,
  replacement: string,
): string {
  if (!options.regex) return replacement;
  const piece = text.slice(match.from, match.to);
  try {
    return piece.replace(new RegExp(query, options.caseSensitive ? "" : "i"), replacement);
  } catch {
    return replacement;
  }
}

/** 第一个位于 pos 之后（含）的匹配下标；没有就回到第 0 个。 */
export function matchIndexAt(matches: FindMatch[], pos: number): number {
  if (matches.length === 0) return -1;
  const index = matches.findIndex((match) => match.to > pos);
  return index < 0 ? 0 : index;
}
