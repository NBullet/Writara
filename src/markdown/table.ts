import type { SyntaxNode } from "@lezer/common";

export type Alignment = "" | "left" | "center" | "right";

export interface TableGrid {
  header: string[];
  rows: string[][];
  align: Alignment[];
  /** 显式列宽（百分比）。空数组 = 各列等宽，交给浏览器自动布局。 */
  percents: number[];
}

/** 从 Lezer 的 Table 节点里取出单元格原文与对齐方式。 */
export function readTable(source: string, table: SyntaxNode): TableGrid {
  const header = table.getChild("TableHeader");
  const rows = table.getChildren("TableRow");
  // 分隔行（|:--|--:|）是 Table 的直接子节点；行内的 | 是 TableDelimiter 的子节点。
  const delimiter = table.getChildren("TableDelimiter")[0];

  const cellsOf = (node: SyntaxNode | null): string[] =>
    node ? node.getChildren("TableCell").map((cell) => source.slice(cell.from, cell.to).trim()) : [];

  const head = cellsOf(header);
  const align = delimiter ? parseAlignment(source.slice(delimiter.from, delimiter.to)) : [];
  const cols = Math.max(head.length, align.length, 1);

  return {
    header: head,
    // 空单元格（`|  |  |  |`）不会生成 TableCell 节点，行会短一截；
    // 这里补成同样列数，否则渲染出来是一行没有格子的 <tr>，也点不进去。
    rows: rows.map((row) => pad(cellsOf(row), cols)),
    align,
    percents: delimiter ? columnPercents(source.slice(delimiter.from, delimiter.to)) : [],
  };
}

function pad(cells: string[], cols: number): string[] {
  if (cells.length >= cols) return cells.slice(0, cols);
  return [...cells, ...Array.from({ length: cols - cells.length }, () => "")];
}

/**
 * 分隔行里每格的横线数量 → 列宽权重。
 *
 * GFM 只要求至少 3 个 `-`，多写不影响语义，所以这是**唯一**能把列宽存进
 * Markdown 本身、又不需要私有元数据的写法：`| --- | ------- |` 表示第二列更宽。
 * 拖拽列宽时改写分隔行，导出/打印按同一份权重描 <colgroup>，屏幕与纸面才对得上。
 */
export function columnWeights(delimiterRow: string): number[] {
  return splitRow(delimiterRow).map((cell) => Math.max(1, (cell.match(/-/g) ?? []).length));
}

/** 各列宽度百分比；列宽全等（默认表格）时返回空数组，交给浏览器自动布局。 */
export function columnPercents(delimiterRow: string): number[] {
  const weights = columnWeights(delimiterRow);
  if (weights.length === 0) return [];
  if (weights.every((weight) => weight === weights[0])) return [];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) return [];
  return weights.map((weight) => Math.round((weight / total) * 1000) / 10);
}

export function parseAlignment(delimiterRow: string): Alignment[] {
  const body = delimiterRow.trim().replace(/^\|/, "").replace(/\|$/, "");
  return body.split("|").map((cell) => {
    const value = cell.trim();
    const left = value.startsWith(":");
    const right = value.endsWith(":");
    if (left && right) return "center";
    if (right) return "right";
    if (left) return "left";
    return "";
  });
}

/** 单元格内容是行内 Markdown，允许 `\|` 转义竖线。 */
export function splitRow(row: string): string[] {
  const body = row.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      current += "|";
      index += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current.trim());
  return cells;
}

/** 表格尺寸上限：「插入表格」对话框与 `insertTable` 共用，避免两处各写一遍。 */
export const TABLE_LIMITS = { rows: 20, columns: 12 } as const;

/**
 * 「3x3」「4 × 2」「5*3」→ `{ rows, columns }`。
 * 解析不出来时退回 3x3；超出上限就夹到上限（与 `insertTable` 的行为一致）。
 */
export function parseTableSize(text: string): { rows: number; columns: number } {
  const numbers = text
    .split(/[^0-9]+/)
    .map((part) => Number.parseInt(part, 10))
    .filter((value) => Number.isFinite(value));

  const clamp = (value: number, max: number) => Math.min(max, Math.max(1, value));
  return {
    rows: clamp(numbers[0] ?? 3, TABLE_LIMITS.rows),
    columns: clamp(numbers[1] ?? 3, TABLE_LIMITS.columns),
  };
}
