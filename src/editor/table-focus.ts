/**
 * 渲染态表格里「最后操作过的单元格」。
 *
 * 表格 widget 常驻之后，CodeMirror 的光标不再进入表内：块级 replace 的范围里放不下
 * 光标，硬放只会落到块的边界。单元格编辑因此走浮层，而「右键菜单对哪一格生效」
 * 「工具条要改哪一列」需要一个跨 widget 重建保留的记忆点。
 *
 * 只记一份：同一时刻只有一张表在被操作。
 */
export interface ActiveTableCell {
  tableFrom: number;
  /** 0 = 表头，1 = 分隔行，2 起 = 正文行。 */
  rowIndex: number;
  colIndex: number;
  /** 单元格内容在文档里的起点，供右键菜单定位表格。 */
  pos: number;
}

let active: ActiveTableCell | null = null;

export function setActiveTableCell(cell: ActiveTableCell | null): void {
  active = cell;
}

export function activeTableCell(tableFrom?: number): ActiveTableCell | null {
  if (!active) return null;
  if (tableFrom !== undefined && active.tableFrom !== tableFrom) return null;
  return active;
}

/**
 * Tab 连跳：提交当前格之后，下一格要在 widget 重建后的新 DOM 上再打开。
 * 提交会触发一次 transaction → widget 重建，所以把「待打开的格子」放在模块级，
 * 由新 widget 的 toDOM 取走。
 */
export interface PendingTableCell {
  tableFrom: number;
  rowIndex: number;
  colIndex: number;
  at: number;
}

let pending: PendingTableCell | null = null;

export function setPendingTableCell(
  tableFrom: number,
  rowIndex: number,
  colIndex: number,
): void {
  pending = { tableFrom, rowIndex, colIndex, at: Date.now() };
}

/** 取走属于这张表的待打开单元格；超过 1 秒视为过期，避免迟到的重建抢焦点。 */
export function takePendingTableCell(tableFrom: number): PendingTableCell | null {
  if (!pending) return null;
  if (pending.tableFrom !== tableFrom || Date.now() - pending.at > 1000) {
    pending = null;
    return null;
  }
  const value = pending;
  pending = null;
  return value;
}
