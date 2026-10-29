import { redo, undo } from "@codemirror/commands";
import { indentUnit, syntaxTree } from "@codemirror/language";
import type { ChangeSpec, EditorState, Line, SelectionRange } from "@codemirror/state";
import { EditorSelection } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { splitRow } from "../markdown/table";

/**
 * 编辑命令：全部基于 CodeMirror 事务，保证撤销栈、光标映射都正确。
 * 菜单项与快捷键调用同一批函数。
 */

export type HeadingLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

const BULLET = /^(\s*)[-*+]\s+/;
const ORDERED = /^(\s*)\d+[.)]\s+/;
const TASK = /^(\s*)[-*+]\s+\[[ xX]\]\s+/;
const QUOTE = /^(\s*)>\s?/;
const HEADING = /^\s*#{1,6}\s+/;

function selectedLines(state: EditorState): Line[] {
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from);
  const last = state.doc.lineAt(range.to);
  const lines: Line[] = [];
  for (let number = first.number; number <= last.number; number += 1) {
    lines.push(state.doc.line(number));
  }
  return lines;
}

function replaceLines(view: EditorView, map: (text: string, index: number) => string): void {
  const lines = selectedLines(view.state);
  const changes: ChangeSpec[] = lines.map((line, index) => ({
    from: line.from,
    to: line.to,
    insert: map(line.text, index),
  }));
  view.dispatch({ changes });
}

function stripListMark(text: string): string {
  return text.replace(TASK, "").replace(ORDERED, "").replace(BULLET, "");
}

// ---- 标题 ----

export function currentHeadingLevel(state: EditorState): HeadingLevel {
  const line = state.doc.lineAt(state.selection.main.head);
  const match = /^\s*(#{1,6})\s+/.exec(line.text);
  return (match ? match[1]!.length : 0) as HeadingLevel;
}

export function setHeading(view: EditorView, level: HeadingLevel): boolean {
  replaceLines(view, (text) => {
    const body = text.replace(HEADING, "").trimStart();
    return level === 0 ? body : `${"#".repeat(level)} ${body}`;
  });
  view.focus();
  return true;
}

export function promoteHeading(view: EditorView): boolean {
  const level = currentHeadingLevel(view.state);
  return setHeading(view, Math.max(0, level - 1) as HeadingLevel);
}

export function demoteHeading(view: EditorView): boolean {
  const level = currentHeadingLevel(view.state);
  return setHeading(view, Math.min(6, level + 1) as HeadingLevel);
}

// ---- 行内格式 ----

function sliceSafe(state: EditorState, from: number, to: number): string {
  return state.sliceDoc(Math.max(0, from), Math.min(state.doc.length, to));
}

export function toggleWrap(view: EditorView, open: string, close = open): boolean {
  const state = view.state;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to);
  const before = sliceSafe(state, range.from - open.length, range.from);
  const after = sliceSafe(state, range.to, range.to + close.length);

  if (text.length >= open.length + close.length && text.startsWith(open) && text.endsWith(close)) {
    const inner = text.slice(open.length, text.length - close.length);
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: inner },
      selection: EditorSelection.range(range.from, range.from + inner.length),
    });
    view.focus();
    return true;
  }

  if (before === open && after === close) {
    view.dispatch({
      changes: [
        { from: range.from - open.length, to: range.from },
        { from: range.to, to: range.to + close.length },
      ],
      selection: EditorSelection.range(range.from - open.length, range.to - open.length),
    });
    view.focus();
    return true;
  }

  if (range.empty) {
    view.dispatch({
      changes: { from: range.from, insert: open + close },
      selection: EditorSelection.cursor(range.from + open.length),
    });
    view.focus();
    return true;
  }

  view.dispatch({
    changes: { from: range.from, to: range.to, insert: open + text + close },
    selection: EditorSelection.range(range.from + open.length, range.from + open.length + text.length),
  });
  view.focus();
  return true;
}

export function toggleBold(view: EditorView): boolean {
  return toggleWrap(view, "**");
}

export function toggleItalic(view: EditorView): boolean {
  return toggleWrap(view, "*");
}

export function toggleStrike(view: EditorView): boolean {
  return toggleWrap(view, "~~");
}

export function toggleHighlight(view: EditorView): boolean {
  return toggleWrap(view, "==");
}

export function toggleCode(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to);
  const marker = text.includes("`") ? "``" : "`";
  return toggleWrap(view, marker);
}

export function toggleUnderline(view: EditorView): boolean {
  return toggleWrap(view, "<u>", "</u>");
}

export function toggleComment(view: EditorView): boolean {
  return toggleWrap(view, "<!-- ", " -->");
}

/** 去掉选区里的行内标记；没有选区时去掉当前行的。 */
export function clearFormatting(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const from = range.empty ? state.doc.lineAt(range.head).from : range.from;
  const to = range.empty ? state.doc.lineAt(range.head).to : range.to;
  const text = state.sliceDoc(from, to);
  const cleaned = text
    .replace(/<\/?u>/g, "")
    .replace(/<!--\s?|\s?-->/g, "")
    .replace(/(\*\*|__|~~|==)/g, "")
    .replace(/`+/g, "")
    .replace(/\*|_/g, "");
  view.dispatch({ changes: { from, to, insert: cleaned } });
  view.focus();
  return true;
}

// ---- 段落 / 列表 ----

export function toggleBlockquote(view: EditorView): boolean {
  const lines = selectedLines(view.state);
  const allQuoted = lines.every((line) => QUOTE.test(line.text));
  replaceLines(view, (text) => (allQuoted ? text.replace(QUOTE, "$1") : `> ${text}`));
  view.focus();
  return true;
}

export type ListKind = "bullet" | "ordered" | "task";

function hasListMark(text: string, kind: ListKind): boolean {
  if (kind === "task") return TASK.test(text);
  if (kind === "ordered") return ORDERED.test(text) && !TASK.test(text);
  return BULLET.test(text) && !TASK.test(text);
}

export function toggleList(view: EditorView, kind: ListKind): boolean {
  const lines = selectedLines(view.state);
  const allMarked = lines.every((line) => hasListMark(line.text, kind));

  replaceLines(view, (text, index) => {
    const body = stripListMark(text);
    if (allMarked) return body;
    if (kind === "ordered") return `${index + 1}. ${body}`;
    if (kind === "task") return `- [ ] ${body}`;
    return `- ${body}`;
  });
  view.focus();
  return true;
}

/** 行首的引用前缀（`> ` / `> > `）：缩进要插在它后面，不能把 `>` 推走。 */
const QUOTE_PREFIX = /^(?:[ \t]*>[ \t]?)+/;
const LIST_MARKER = /^([ \t]*)([-*+]|\d+[.)])([ \t]+)/;

function quotePrefix(text: string): string {
  return QUOTE_PREFIX.exec(text)?.[0] ?? "";
}

interface ListMarker {
  /** 行首引用前缀（按原样保留，缩进插在它后面）。 */
  prefix: string;
  /** 前缀之后的缩进（字符数）。 */
  indent: number;
  /** 标记本身的宽度：`- ` 是 2，`1. ` 是 3。 */
  width: number;
}

function markerOf(text: string): ListMarker | null {
  const prefix = quotePrefix(text);
  const match = LIST_MARKER.exec(text.slice(prefix.length));
  if (!match) return null;
  return {
    prefix,
    indent: (match[1] ?? "").length,
    width: (match[2] ?? "").length + (match[3] ?? "").length,
  };
}

/**
 * 同一层级的上一个列表项的**内容列**（相对引用前缀）。
 *
 * 只允许挂到上一个兄弟项下面：第一项没有可挂的父级，Tab 就应该什么都不做。
 * 这也是缩进的硬边界 —— 没有它，按住 Tab 会让整块无限右移，正文被挤成
 * 一行一个屏幕宽，布局直接卡死（见 editing-bugs.md）。
 */
function previousSiblingColumn(state: EditorState, first: number, marker: ListMarker): number | null {
  for (let number = first - 1; number >= 1; number -= 1) {
    const line = state.doc.line(number);
    const prefix = quotePrefix(line.text);
    // 空行与空的引用行可以跨过（松散列表）。
    if (line.text.slice(prefix.length).trim() === "") continue;
    if (prefix !== marker.prefix) return null;
    const indent = /^[ \t]*/.exec(line.text.slice(prefix.length))?.[0].length ?? 0;
    if (indent < marker.indent) return null;
    if (indent > marker.indent) continue; // 上一项的续行 / 子项，继续往上找
    const sibling = markerOf(line.text);
    // 同层但不是列表项：列表已经结束，宁可不缩进也不要缩错。
    return sibling ? sibling.indent + sibling.width : null;
  }
  return null;
}

/**
 * 列表缩进的步长取「标记宽度」，至少一个缩进单位。
 * 有序列表的标记是 `1. `（3 列），只加 2 个空格的话解析器根本不认为它嵌套了。
 */
function indentStep(state: EditorState, lineNumber: number, unit: string): string {
  const marker = markerOf(state.doc.line(lineNumber).text);
  if (!marker) return unit;
  return " ".repeat(Math.max(unit.length, marker.width));
}

/** 行首缩进最多退掉一个缩进步长；Tab 缩进算一整个步长。 */
function dedentWidth(text: string, step: string): number {
  let width = 0;
  while (width < text.length && width < step.length) {
    const char = text[width];
    if (char === "\t") return width + 1;
    if (char !== " ") break;
    width += 1;
  }
  return width;
}

/** 光标所在的列表项节点，连同它的子项与续行。 */
function listItemBlock(state: EditorState, pos: number): { first: number; last: number } | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
  while (node) {
    if (node.name === "ListItem") {
      const first = state.doc.lineAt(node.from).number;
      const end = node.to > node.from ? node.to - 1 : node.from;
      return { first, last: state.doc.lineAt(end).number };
    }
    node = node.parent;
  }
  return null;
}

function rangeLines(state: EditorState, range: SelectionRange): {
  first: number;
  last: number;
} {
  const first = state.doc.lineAt(range.from).number;
  const lastLine = state.doc.lineAt(range.to);
  // 选区正好停在下一行行首时，那一行不算被选中（与 CodeMirror 的 indentMore 同口径）。
  const last = !range.empty && range.to === lastLine.from ? lastLine.number - 1 : lastLine.number;
  return { first, last: Math.max(first, last) };
}

/** 按行平移缩进；插入点在行首（引用块里是 `>` 之后），光标要跟着文字一起走。 */
function shiftLines(
  view: EditorView,
  numbers: number[],
  direction: 1 | -1,
  step: string,
): boolean {
  const state = view.state;
  const changes: ChangeSpec[] = [];
  for (const number of numbers) {
    const line = state.doc.line(number);
    const offset = quotePrefix(line.text).length;
    const rest = line.text.slice(offset);
    if (direction > 0) {
      if (rest.trim() === "") continue;
      changes.push({ from: line.from + offset, insert: step });
    } else {
      const width = dedentWidth(rest, step);
      if (width > 0) changes.push({ from: line.from + offset, to: line.from + offset + width });
    }
  }
  if (changes.length === 0) return false;

  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    // 与 CodeMirror 的 indentMore 一致：assoc 1，光标落在新增缩进之后。
    selection: state.selection.map(changeSet, 1),
    userEvent: "input.indent",
  });
  return true;
}

function lineNumbers(first: number, last: number): number[] {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index);
}

/**
 * 列表项整块缩进 / 退回。
 *
 * 缩进只挂到「上一个兄弟项」的内容列：这一项没有上一个兄弟项时不动，
 * 否则按住 Tab 会无限右移（行被挤到屏幕外、布局卡死）。
 */
function indentListItem(
  view: EditorView,
  block: { first: number; last: number },
  direction: 1 | -1,
  unit: string,
): void {
  const state = view.state;
  const marker = markerOf(state.doc.line(block.first).text);
  const numbers = lineNumbers(block.first, block.last);
  if (!marker) {
    if (direction > 0) shiftLines(view, numbers, 1, unit);
    else shiftLines(view, numbers, -1, unit);
    return;
  }

  if (direction > 0) {
    const target = previousSiblingColumn(state, block.first, marker);
    if (target === null) return;
    const delta = target - marker.indent;
    if (delta <= 0) return;
    shiftLines(view, numbers, 1, " ".repeat(delta));
    return;
  }

  // 退回一层：最多退掉自己标记的宽度（`- ` = 2、`1. ` = 3）。
  const step = Math.min(marker.indent, marker.width);
  if (step <= 0) return;
  shiftLines(view, numbers, -1, " ".repeat(step));
}

/**
 * Tab / Shift+Tab（菜单的「增加 / 减少缩进」同一条路径）。
 *
 * - 在列表项里：**整块**缩进，且只能挂到上一个兄弟项下面（第一项不动）。
 * - 有选区：按整行缩进，与多数编辑器一致。
 * - 普通段落 / 代码块：Tab 在光标处插入一个缩进单位。
 * - Shift+Tab 退不掉时也吞掉按键：不让焦点被 Tab 带出编辑区（Ctrl+M 可切换焦点模式）。
 */
export function indentBlock(view: EditorView, direction: 1 | -1): boolean {
  const state = view.state;
  const unit = state.facet(indentUnit) || "  ";
  const main = state.selection.main;

  if (main.empty) {
    const block = listItemBlock(state, main.head);
    if (block) {
      indentListItem(view, block, direction, unit);
      return true;
    }

    if (direction > 0) {
      view.dispatch(state.replaceSelection(unit), { scrollIntoView: true, userEvent: "input" });
      return true;
    }

    const line = state.doc.lineAt(main.head);
    shiftLines(view, [line.number], -1, unit);
    return true;
  }

  const numbers = new Set<number>();
  for (const range of state.selection.ranges) {
    const { first, last } = rangeLines(state, range);
    for (const number of lineNumbers(first, last)) numbers.add(number);
  }
  const step = indentStep(state, state.doc.lineAt(main.from).number, unit);
  shiftLines(view, [...numbers].sort((a, b) => a - b), direction, step);
  return true;
}

export function indentList(view: EditorView, direction: 1 | -1): boolean {
  return indentBlock(view, direction);
}

export function insertParagraph(view: EditorView, where: "above" | "below"): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  if (where === "above") {
    view.dispatch({ changes: { from: line.from, insert: "\n" }, selection: EditorSelection.cursor(line.from) });
  } else {
    view.dispatch({
      changes: { from: line.to, insert: "\n" },
      selection: EditorSelection.cursor(line.to + 1),
    });
  }
  view.focus();
  return true;
}

export function insertHorizontalRule(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const text = "\n\n---\n\n";
  view.dispatch({ changes: { from: pos, insert: text }, selection: EditorSelection.cursor(pos + text.length) });
  view.focus();
  return true;
}

export function insertToc(view: EditorView): boolean {
  const pos = view.state.selection.main.head;
  const text = "[TOC]\n\n";
  view.dispatch({ changes: { from: pos, insert: text }, selection: EditorSelection.cursor(pos + text.length) });
  view.focus();
  return true;
}

export function insertFrontMatter(view: EditorView, title = ""): boolean {
  const state = view.state;
  if (state.doc.line(1).text.trim() === "---") {
    view.focus();
    return false;
  }
  const text = `---\ntitle: ${title}\n---\n\n`;
  view.dispatch({ changes: { from: 0, insert: text }, selection: EditorSelection.cursor(text.length) });
  view.focus();
  return true;
}

export function insertCodeBlock(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const body = state.sliceDoc(range.from, range.to);
  const text = `\`\`\`\n${body}\n\`\`\`\n`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: EditorSelection.cursor(range.from + 3),
  });
  view.focus();
  return true;
}

export function insertMathBlock(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const body = state.sliceDoc(range.from, range.to);
  const text = `$$\n${body}\n$$\n`;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert: text },
    selection: EditorSelection.cursor(range.from + 3),
  });
  view.focus();
  return true;
}

export function insertInlineMath(view: EditorView): boolean {
  return toggleWrap(view, "$");
}

export function insertLink(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const text = state.sliceDoc(range.from, range.to) || "链接文字";
  const insert = `[${text}](url)`;
  const urlStart = range.from + text.length + 3;
  view.dispatch({
    changes: { from: range.from, to: range.to, insert },
    selection: EditorSelection.range(urlStart, urlStart + 3),
  });
  view.focus();
  return true;
}

/** 在文末追加脚注定义，并在光标处插入引用。 */
export function insertFootnote(view: EditorView): boolean {
  const state = view.state;
  const used = [...state.doc.toString().matchAll(/\[\^(\d+)\]/g)].map((match) => Number(match[1]));
  const number = (used.length ? Math.max(...used) : 0) + 1;
  const ref = `[^${number}]`;
  const pos = state.selection.main.head;
  const end = state.doc.length;
  const definition = `\n\n[^${number}]: `;

  view.dispatch({
    changes: [
      { from: pos, insert: ref },
      { from: end, insert: definition },
    ],
    selection: EditorSelection.cursor(end + definition.length),
  });
  view.focus();
  return true;
}

/** 插入参考式链接，定义放到文末。 */
export function insertLinkReference(view: EditorView): boolean {
  const state = view.state;
  const range = state.selection.main;
  const label = state.sliceDoc(range.from, range.to) || "文字";
  const key = `ref${Date.now().toString(36).slice(-4)}`;
  const pos = range.from;
  const end = state.doc.length;
  const definition = `\n\n[${key}]: https://`;

  view.dispatch({
    changes: [
      { from: pos, to: range.to, insert: `[${label}][${key}]` },
      { from: end, insert: definition },
    ],
    selection: EditorSelection.cursor(end + definition.length),
  });
  view.focus();
  return true;
}

// ---- 表格 ----

export interface TableContext {
  from: number;
  to: number;
  rows: string[][];
  align: Array<"" | "left" | "center" | "right">;
  /** 光标所在行的表格行号（不含分隔行）。 */
  rowIndex: number;
  columnIndex: number;
}

function isTableLine(text: string): boolean {
  return text.includes("|") && text.trim().length > 0;
}

function parseAlignments(row: string[]): Array<"" | "left" | "center" | "right"> {
  return row.map((cell) => {
    const value = cell.trim();
    const left = value.startsWith(":");
    const right = value.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "";
  });
}

export function findTableContext(state: EditorState): TableContext | null {
  const head = state.selection.main.head;
  const line = state.doc.lineAt(head);
  if (!isTableLine(line.text)) return null;

  let first = line.number;
  let last = line.number;
  while (first > 1 && isTableLine(state.doc.line(first - 1).text)) first -= 1;
  while (last < state.doc.lines && isTableLine(state.doc.line(last + 1).text)) last += 1;

  const lines: string[] = [];
  for (let number = first; number <= last; number += 1) lines.push(state.doc.line(number).text);
  if (lines.length < 2) return null;

  const delimiter = lines[1] ?? "";
  if (!/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(delimiter)) return null;

  const rows = [splitRow(lines[0] ?? ""), ...lines.slice(2).map((row) => splitRow(row))];
  const align = parseAlignments(splitRow(delimiter));

  const lineIndex = line.number - first;
  const rowIndex = Math.min(rows.length - 1, Math.max(0, lineIndex <= 1 ? 0 : lineIndex - 1));

  const offsetInLine = Math.max(0, head - line.from);
  const leadingPipe = line.text.trimStart().startsWith("|") ? 1 : 0;
  let pipes = 0;
  for (let index = 0; index < offsetInLine && index < line.text.length; index += 1) {
    if (line.text[index] === "|") pipes += 1;
  }
  const columnIndex = Math.max(0, pipes - leadingPipe);

  return {
    from: state.doc.line(first).from,
    to: state.doc.line(last).to,
    rows,
    align,
    rowIndex,
    columnIndex,
  };
}

function renderTable(context: TableContext): string {
  const columns = Math.max(1, ...context.rows.map((row) => row.length), context.align.length);
  const pad = (row: string[]): string[] => Array.from({ length: columns }, (_, index) => row[index] ?? "");

  const alignCell = (align: "" | "left" | "center" | "right"): string => {
    if (align === "left") return ":---";
    if (align === "right") return "---:";
    if (align === "center") return ":---:";
    return "---";
  };

  const header = `| ${pad(context.rows[0] ?? []).join(" | ")} |`;
  const alignment = `| ${Array.from({ length: columns }, (_, index) => alignCell(context.align[index] ?? "")).join(" | ")} |`;
  const body = context.rows.slice(1).map((row) => `| ${pad(row).join(" | ")} |`);
  return [header, alignment, ...body].join("\n");
}

function editTable(view: EditorView, transform: (context: TableContext) => void): boolean {
  const context = findTableContext(view.state);
  if (!context) return false;
  transform(context);
  view.dispatch({
    changes: { from: context.from, to: context.to, insert: renderTable(context) },
  });
  view.focus();
  return true;
}

export function insertTable(view: EditorView, rows = 3, columns = 3): boolean {
  const header = `| ${Array.from({ length: columns }, (_, index) => `列${index + 1}`).join(" | ")} |`;
  const alignment = `| ${Array.from({ length: columns }, () => "---").join(" | ")} |`;
  const body = Array.from({ length: Math.max(0, rows - 1) }, () => `| ${Array.from({ length: columns }, () => "  ").join(" | ")} |`);
  const text = `\n${[header, alignment, ...body].join("\n")}\n\n`;
  const pos = view.state.selection.main.head;
  view.dispatch({ changes: { from: pos, insert: text }, selection: EditorSelection.cursor(pos + 3) });
  view.focus();
  return true;
}

export function tableAddRow(view: EditorView, where: "above" | "below"): boolean {
  return editTable(view, (context) => {
    const row = context.rows[Math.max(0, context.rowIndex)] ?? [];
    const empty = Array.from({ length: Math.max(row.length, context.align.length, 1) }, () => "");
    const at = where === "above" ? context.rowIndex + 1 : context.rowIndex + 2;
    context.rows.splice(at, 0, empty);
  });
}

export function tableDeleteRow(view: EditorView): boolean {
  return editTable(view, (context) => {
    if (context.rows.length <= 1) return;
    context.rows.splice(Math.max(1, context.rowIndex), 1);
  });
}

export function tableAddColumn(view: EditorView, where: "left" | "right"): boolean {
  return editTable(view, (context) => {
    const at = where === "left" ? context.columnIndex : context.columnIndex + 1;
    for (const row of context.rows) row.splice(at, 0, "");
    context.align.splice(at, 0, "");
  });
}

export function tableDeleteColumn(view: EditorView): boolean {
  return editTable(view, (context) => {
    const columns = Math.max(...context.rows.map((row) => row.length));
    if (columns <= 1) return;
    for (const row of context.rows) row.splice(context.columnIndex, 1);
    context.align.splice(context.columnIndex, 1);
  });
}

export function tableAlign(view: EditorView, align: "left" | "center" | "right"): boolean {
  return editTable(view, (context) => {
    const columns = Math.max(1, ...context.rows.map((row) => row.length));
    context.align = Array.from({ length: columns }, (_, index) =>
      index === context.columnIndex ? align : context.align[index] ?? "",
    );
  });
}

// ---- 选择 / 删除 / 历史 ----

export function selectLine(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  view.dispatch({ selection: EditorSelection.range(line.from, line.to) });
  view.focus();
  return true;
}

export function selectBlock(view: EditorView): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  let start = state.doc.lineAt(head).number;
  let end = start;
  while (start > 1 && state.doc.line(start - 1).text.trim() !== "") start -= 1;
  while (end < state.doc.lines && state.doc.line(end + 1).text.trim() !== "") end += 1;
  view.dispatch({
    selection: EditorSelection.range(state.doc.line(start).from, state.doc.line(end).to),
  });
  view.focus();
  return true;
}

/** 勾选/取消当前行的任务框；不是任务行时返回 false。 */
export function setTaskState(view: EditorView, done: boolean): boolean {
  const range = view.state.selection.main;
  const first = view.state.doc.lineAt(range.from).number;
  const last = view.state.doc.lineAt(range.to).number;
  let changed = false;
  const changes: ChangeSpec[] = [];

  for (let number = first; number <= last; number += 1) {
    const line = view.state.doc.line(number);
    const match = /^(\s*[-*+]\s+)\[([ xX])\]/.exec(line.text);
    if (!match) continue;
    changed = true;
    const markerFrom = line.from + match[1]!.length;
    changes.push({ from: markerFrom, to: markerFrom + 3, insert: done ? "[x]" : "[ ]" });
  }

  if (!changed) return false;
  view.dispatch({ changes });
  view.focus();
  return true;
}

/** 删除选区；没有选区时删除当前行。 */
export function deleteSelection(view: EditorView): boolean {
  const ranges = view.state.selection.ranges;
  if (ranges.every((range) => range.empty)) return deleteLine(view);
  view.dispatch({ changes: ranges.map((range) => ({ from: range.from, to: range.to })) });
  view.focus();
  return true;
}

export function deleteLine(view: EditorView): boolean {  const line = view.state.doc.lineAt(view.state.selection.main.head);
  const from = line.from;
  const to = line.number < view.state.doc.lines ? line.to + 1 : line.to;
  view.dispatch({ changes: { from, to } });
  view.focus();
  return true;
}

export function deleteBlock(view: EditorView): boolean {
  const state = view.state;
  const head = state.selection.main.head;
  let start = state.doc.lineAt(head).number;
  let end = start;
  while (start > 1 && state.doc.line(start - 1).text.trim() !== "") start -= 1;
  while (end < state.doc.lines && state.doc.line(end + 1).text.trim() !== "") end += 1;
  const from = state.doc.line(start).from;
  const to = end < state.doc.lines ? state.doc.line(end).to + 1 : state.doc.line(end).to;
  view.dispatch({ changes: { from, to } });
  view.focus();
  return true;
}

export function undoCommand(view: EditorView): boolean {
  return undo(view);
}

export function redoCommand(view: EditorView): boolean {
  return redo(view);
}
