import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { EditorView } from "@codemirror/view";

import {
  deleteColumn,
  deleteRow,
  deleteTable,
  formatTable,
  insertColumn,
  insertRow,
  setColumnAlignment,
  tableAt,
  type TableChange,
  type TableTarget,
} from "../markdown/table-edit";
import { activeTableCell } from "./table-focus";

/**
 * 表格的右键菜单：定位当前表格 + 执行命令。
 *
 * 编辑器里表格默认常驻渲染态；光标只有在「被程序化送进表内」时才会退回源码。
 * 渲染态的点击由 widget 自己记下单元格（table-blocks.ts），所以定位优先用
 * 那个记忆点，`posAtCoords` 只用来发现「点在表格外」。
 */

export type TableCommand =
  | "row-above"
  | "row-below"
  | "col-left"
  | "col-right"
  | "row-delete"
  | "col-delete"
  | "table-delete"
  | "align-left"
  | "align-center"
  | "align-right"
  | "align-none"
  | "format";

export interface TableMenuState {
  target: TableTarget;
}

/** 光标（或点击位置）刚好落在一张表里时返回表格信息。 */
export function tableContextAt(
  view: EditorView,
  coords?: { x: number; y: number },
): TableMenuState | null {
  const { state } = view;
  const head = state.selection.main.head;
  const source = state.doc.toString();

  const tableNode = (pos: number) => {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, -1);
    while (node && node.name !== "Table") node = node.parent;
    return node ?? null;
  };

  const clicked = coords ? view.posAtCoords(coords) : null;
  const node = (clicked == null ? null : tableNode(clicked)) ?? tableNode(head);
  if (!node) return null;

  // 渲染态表格是块级 widget：posAtCoords 只能给出块的起点，取不到具体单元格。
  // 单元格由 table-blocks.ts 在点击/右键时记下，这里优先用它。
  const remembered = clicked != null ? activeTableCell(node.from) : null;
  const insideTable = head >= node.from && head <= node.to;
  // 光标在表内（源码态）时，widget 的点击已经由选区表达，命中位置可能是块起点。
  const atBlockStart = clicked != null && clicked === node.from && insideTable;
  const anchor = remembered
    ? Math.min(Math.max(remembered.pos, node.from), node.to)
    : atBlockStart
      ? head
      : (clicked ?? head);
  if (anchor < node.from || anchor > node.to) return null;

  const target = tableAt(source, node.from, node.to, anchor);
  if (!target) return null;
  return { target };
}

/** 菜单条目（顺序固定，UI 只负责翻译成按钮）。 */
export function tableCommandList(target: TableTarget): Array<{
  command: TableCommand;
  label: string;
  disabled?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
}> {
  return [
    { command: "row-above", label: "在上方插入行", disabled: target.rowIndex === 0 },
    { command: "row-below", label: "在下方插入行" },
    { command: "col-left", label: "在左侧插入列" },
    { command: "col-right", label: "在右侧插入列" },
    { command: "row-delete", label: "删除本行", disabled: target.rowIndex < 2, separatorBefore: true },
    { command: "col-delete", label: "删除本列" },
    { command: "table-delete", label: "删除整个表格", danger: true },
    { command: "align-left", label: "本列左对齐", separatorBefore: true },
    { command: "align-center", label: "本列居中" },
    { command: "align-right", label: "本列右对齐" },
    { command: "align-none", label: "本列默认对齐" },
    { command: "format", label: "格式化表格", separatorBefore: true },
  ];
}

/** 执行一条表格命令；成功返回 true。 */
export function runTableCommand(view: EditorView, target: TableTarget, command: TableCommand): boolean {
  const change = changeFor(target, command);
  if (!change) return false;

  const source = view.state.doc.toString();
  let to = change.to;
  // 删掉整张表时连带后面的换行，别留一行空行
  if (change.insert === "" && source[to] === "\n") to += 1;

  view.dispatch({
    changes: { from: change.from, to, insert: change.insert },
    selection: { anchor: Math.min(change.from, view.state.doc.length) },
  });
  view.focus();
  return true;
}

function changeFor(target: TableTarget, command: TableCommand): TableChange | null {
  switch (command) {
    case "row-above":
      return insertRow(target, "above");
    case "row-below":
      return insertRow(target, "below");
    case "col-left":
      return insertColumn(target, "left");
    case "col-right":
      return insertColumn(target, "right");
    case "row-delete":
      return deleteRow(target);
    case "col-delete":
      return deleteColumn(target);
    case "table-delete":
      return deleteTable(target);
    case "align-left":
      return setColumnAlignment(target, "left");
    case "align-center":
      return setColumnAlignment(target, "center");
    case "align-right":
      return setColumnAlignment(target, "right");
    case "align-none":
      return setColumnAlignment(target, "");
    case "format":
      return formatTable(target);
    default:
      return null;
  }
}
