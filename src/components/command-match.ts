export type PaletteGroup = "recent" | "command" | "file" | "heading";

export interface PaletteCommand {
  id: string;
  label: string;
  /** 结果分组；缺省按命令处理。 */
  group?: PaletteGroup;
  /** 菜单路径（如「段落 › 表格」）或文件所在目录。 */
  path?: string;
  hint?: string;
  /** 额外参与匹配、但不显示的文字。 */
  keywords?: string;
  /** 空查询时不展示（例如表情符号这种长尾命令）。 */
  hidden?: boolean;
  run: () => void;
}

export interface PaletteMatch {
  command: PaletteCommand;
  score: number;
  indices: number[];
}

function subsequence(haystack: string, needle: string): number[] | null {
  const indices: number[] = [];
  let at = 0;
  for (let position = 0; position < haystack.length; position += 1) {
    if (haystack[position] === needle[at]) {
      indices.push(position);
      at += 1;
      if (at === needle.length) return indices;
    }
  }
  return null;
}

/**
 * 匹配规则：子串优先，其次按关键词 / 路径整串命中，最后才是散落的子序列。
 * 返回的 indices 只用于给标签里的字母加高亮。
 */
export function matchCommand(command: PaletteCommand, query: string): PaletteMatch | null {
  const needle = query.trim().toLowerCase();
  if (!needle) return { command, score: 0, indices: [] };

  const label = command.label.toLowerCase();
  const at = label.indexOf(needle);
  if (at >= 0) {
    return {
      command,
      score: 120 - at * 2 + (at === 0 ? 30 : 0),
      indices: Array.from({ length: needle.length }, (_, offset) => at + offset),
    };
  }

  const extra = `${command.path ?? ""} ${command.keywords ?? ""}`.toLowerCase();
  if (extra.includes(needle)) return { command, score: 55, indices: [] };

  const loose = subsequence(label, needle);
  if (loose) return { command, score: 30 - (loose[0] ?? 0) * 0.1, indices: loose };

  return null;
}
