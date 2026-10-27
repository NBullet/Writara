import type { Alignment } from "./table";
import { splitRow } from "./table";

/**
 * 表格的结构化编辑（右键菜单用）。
 *
 * 编辑器里的表格在两个形态之间来回：光标在表内时显示的是 Markdown 源码，
 * 所以「插入一行」「删除一列」都是**改写整张表的源码**，而不是操作 DOM。
 * 这里只做纯文本变换，方便单测；具体替换范围由调用方 dispatch。
 */

export interface TableTarget {
  /** 表格在文档里的范围。 */
  from: number;
  to: number;
  /** 表格的每一行源码（0 = 表头，1 = 分隔行，2 起 = 正文行）。 */
  lines: string[];
  /** 光标所在行的下标。 */
  rowIndex: number;
  /** 光标所在列（0 起，`| a | b |` 里 a 是 0）。 */
  colIndex: number;
  /** 列数。 */
  cols: number;
}

export interface TableChange {
  from: number;
  to: number;
  insert: string;
}

/** 光标落在哪一行、哪一列。行号与列号都从 0 开始。 */
export function tableAt(
  source: string,
  from: number,
  to: number,
  pos: number,
): TableTarget | null {
  if (pos < from || pos > to) return null;

  const block = source.slice(from, to);
  const lines = block.split("\n");
  if (lines.length < 2) return null;

  const offset = Math.max(0, Math.min(block.length, pos - from));
  const before = block.slice(0, offset);
  const rowIndex = before.split("\n").length - 1;

  const line = lines[rowIndex] ?? "";
  const columnOffset = offset - (before.lastIndexOf("\n") + 1);
  const colIndex = columnAt(line, columnOffset);

  const cols = Math.max(
    splitRow(lines[0] ?? "").length,
    ...lines.map((entry) => splitRow(entry).length),
  );
  if (cols === 0) return null;

  return { from, to, lines, rowIndex, colIndex: Math.min(colIndex, cols - 1), cols };
}

/** 数一数光标前面有几个未转义的 `|`：`| a | b |` 里 a 的偏移算第 0 列。 */
export function columnAt(line: string, offset: number): number {
  let pipes = 0;
  for (let index = 0; index < Math.min(offset, line.length); index += 1) {
    if (line[index] === "\\") {
      index += 1;
      continue;
    }
    if (line[index] === "|") pipes += 1;
  }
  // 行首那个 `|` 只是边界，不计入列号
  return Math.max(0, pipes - 1);
}

/**
 * 在光标所在行的上方 / 下方插入一行。
 * 表头之上没有「行」，返回 null（菜单里据此禁用）。
 */
export function insertRow(target: TableTarget, where: "above" | "below"): TableChange | null {
  if (where === "above" && target.rowIndex === 0) return null;
  const table = parse(target);
  const insertAt = where === "above" ? Math.max(2, target.rowIndex) : Math.max(2, target.rowIndex + 1);
  table.rows.splice(insertAt - 2, 0, emptyRow(table.cols));
  return change(target, render(table));
}

/** 在光标所在列的左 / 右插入一列。 */
export function insertColumn(target: TableTarget, where: "left" | "right"): TableChange | null {
  const table = parse(target);
  const at = where === "left" ? target.colIndex : target.colIndex + 1;
  table.header.splice(at, 0, "");
  table.align.splice(at, 0, table.align[at - 1] ?? table.align[at] ?? "");
  table.weights.splice(at, 0, table.weights[at - 1] ?? table.weights[at] ?? 3);
  for (const row of table.rows) row.splice(at, 0, "");
  return change(target, render(table));
}

/** 删除光标所在行；表头与分隔行不能删。 */
export function deleteRow(target: TableTarget): TableChange | null {
  if (target.rowIndex < 2) return null;
  const table = parse(target);
  table.rows.splice(target.rowIndex - 2, 1);
  return change(target, render(table));
}

/** 删除光标所在列；删到只剩最后一列时整张表一起删掉。 */
export function deleteColumn(target: TableTarget): TableChange | null {
  const table = parse(target);
  if (table.cols <= 1) return deleteTable(target);
  table.header.splice(target.colIndex, 1);
  table.align.splice(target.colIndex, 1);
  table.weights.splice(target.colIndex, 1);
  for (const row of table.rows) row.splice(target.colIndex, 1);
  return change(target, render(table));
}

/** 删除整张表。调用方负责把行尾换行一并吃掉，避免留下一行空行。 */
export function deleteTable(target: TableTarget): TableChange | null {
  return { from: target.from, to: target.to, insert: "" };
}

/** 设置光标所在列的对齐方式（空字符串 = 默认）。 */
export function setColumnAlignment(target: TableTarget, align: Alignment): TableChange | null {
  const table = parse(target);
  if (target.colIndex >= table.cols) return null;
  if (table.align[target.colIndex] === align) return null;
  table.align[target.colIndex] = align;
  return change(target, render(table));
}

/** 规范化整张表：单元格之间统一一个空格。 */
export function formatTable(target: TableTarget): TableChange | null {
  return change(target, render(parse(target)));
}

interface ParsedTable {
  header: string[];
  align: Alignment[];
  rows: string[][];
  cols: number;
  /** 每列横线数（列宽权重）；新建/插入的列取相邻列的值。 */
  weights: number[];
}

function parse(target: TableTarget): ParsedTable {
  const [, delimiter = "", ...rest] = target.lines;
  const header = fit(splitRow(target.lines[0] ?? ""), target.cols);
  const align = fit(splitRow(delimiter).map(toAlignment), target.cols);
  const weights = fit(
    splitRow(delimiter).map((cell) => Math.max(1, (cell.match(/-/g) ?? []).length)),
    target.cols,
  ).map((weight) => weight ?? 1);
  const rows = rest
    .filter((line) => line.trim().startsWith("|") || line.includes("|"))
    .map((line) => fit(splitRow(line), target.cols));
  return { header, align, rows, cols: target.cols, weights };
}

function fit<T>(cells: T[], cols: number): T[] {
  const out = cells.slice(0, cols);
  while (out.length < cols) out.push(undefined as unknown as T);
  return out;
}

function emptyRow(cols: number): string[] {
  return Array.from({ length: cols }, () => "");
}

function toAlignment(cell: string): Alignment {
  const value = cell.trim();
  const left = value.startsWith(":");
  const right = value.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return "";
}

function fromAlignment(align: Alignment | undefined, dashes = 3): string {
  const count = Math.max(3, Math.round(dashes));
  if (align === "left") return `:${"-".repeat(count)}`;
  if (align === "center") return `:${"-".repeat(count)}:`;
  if (align === "right") return `${"-".repeat(count)}:`;
  return "-".repeat(count);
}

function renderCell(cell: string | undefined): string {
  return (cell ?? "").trim().replace(/\|/g, "\\|");
}

function renderRow(cells: Array<string | undefined>): string {
  return `| ${cells.map(renderCell).join(" | ")} |`;
}

function render(table: ParsedTable): string {
  const align = table.align.map((entry, index) => fromAlignment(entry, table.weights[index] ?? 3));
  return [
    renderRow(table.header),
    renderRow(align),
    ...table.rows.map((row) => renderRow(row)),
  ].join("\n");
}

/**
 * 写列宽：`fractions` 与列数等长，按比例折算成横线数。
 * 最小的一列正好 3 个（GFM 下限），其余按比例放大 —— 这样默认表格仍然是最短的 `---`。
 */
export function setColumnWidths(target: TableTarget, fractions: number[]): TableChange | null {
  const table = parse(target);
  if (fractions.length !== table.cols) return null;

  const weights = weightsFromFractions(fractions);
  const changed = weights.some((weight, index) => weight !== table.weights[index]);
  if (!changed) return null;

  table.weights = weights;
  return change(target, render(table));
}

/** 比例 → 横线数（3 起，上限 30，避免分隔行长得离谱）。 */
export function weightsFromFractions(fractions: number[]): number[] {
  const positive = fractions.map((value) => (Number.isFinite(value) && value > 0 ? value : 0.001));
  const min = Math.min(...positive);
  // +1e-9：0.3 / 0.2 * 3 在浮点里是 4.499…，直接 round 会得到 4
  return positive.map((value) =>
    Math.min(30, Math.max(3, Math.round((value / min) * 3 + 1e-9))),
  );
}

function change(target: TableTarget, insert: string): TableChange {
  return { from: target.from, to: target.to, insert };
}
