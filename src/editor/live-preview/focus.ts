import type { EditorState, Text } from "@codemirror/state";

/**
 * 焦点判定的唯一入口。
 *
 * Typora 只有两级焦点粒度（调研见 docs/focus-views.md）：
 *
 * - **span**：行内元素。光标触到哪个节点，就只展开那一个节点的标记。
 *   用「触到」而不是「在内部」：图片 / 行内公式这类原子 widget 只有一个位置，
 *   点击只能落在节点边界上，边界不算就会「点进去却改不了」。
 * - **block**：块级标记（标题的 #、引用的 >、围栏、列表符号）。光标在块内就展开，
 *   整块共享一个编辑态。
 *
 * 不要在这里加第三种粒度：混用会同时出现「整行展开」与「整块展开」两种噪声。
 */

export interface FocusRange {
  from: number;
  to: number;
}

/** 行内元素：光标或选区与节点相交（含边界）就算触到。 */
export function spanTouched(
  node: { from: number; to: number },
  ranges: readonly FocusRange[],
): boolean {
  return ranges.some((range) => range.from <= node.to && range.to >= node.from);
}

/** 块级标记：按行判定，选区与该节点所占的行相交就算在块内。 */
export function linesTouched(
  doc: Text,
  from: number,
  to: number,
  ranges: readonly FocusRange[],
): boolean {
  const first = doc.lineAt(from);
  const last = doc.lineAt(to).to;
  return ranges.some((range) => range.from <= last && range.to >= first.from);
}

/** 块级 StateField 用的版本（它们手里只有 state）。 */
export function blockTouched(state: EditorState, from: number, to: number): boolean {
  return linesTouched(state.doc, from, to, state.selection.ranges);
}
