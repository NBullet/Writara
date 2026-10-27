import { syntaxTree } from "@codemirror/language";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { StateField } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

import { renderInlineMarkdown } from "../../markdown/render";
import { sanitizeHtml } from "../../markdown/sanitize";
import { readTable, type Alignment, type TableGrid } from "../../markdown/table";
import { setColumnWidths, tableAt, type TableTarget } from "../../markdown/table-edit";
import { runTableCommand, type TableCommand } from "../table-menu";
import {
  activeTableCell,
  setActiveTableCell,
  setPendingTableCell,
  takePendingTableCell,
} from "../table-focus";

/**
 * 表格块 → 真实表格。
 *
 * 与 SVG 一样必须走 StateField（ViewPlugin 不能提供 block decoration）。
 *
 * 编辑态与 Typora 对齐（见 docs/focus-views.md）：
 * **表格不再因为光标进入而消失**。块级 replace 里放不下光标，所以单元格编辑走
 * 叠在单元格上的输入框；表格工具条浮在表头上方。只有程序化地把选区送进表内
 * （搜索跳转、逐字选择）时才退回源码，否则光标会「看不见」。
 *
 * 改单元格 = 一次 transaction，撤销粒度就是这一次编辑；结构命令复用
 * markdown/table-edit.ts 的纯变换（与右键菜单同一套）。
 */

const ALIGN_CLASS: Record<Alignment, string> = {
  "": "",
  left: "wr-align-left",
  center: "wr-align-center",
  right: "wr-align-right",
};

interface CellRange {
  from: number;
  to: number;
}

interface TableMeta {
  from: number;
  to: number;
  /** 表格源码（建 widget 时的快照，点击单元格时用来取这一格的原文）。 */
  source: string;
  header: CellRange[];
  rows: CellRange[][];
  align: Alignment[];
}

const htmlCache = new Map<string, string>();
const CACHE_LIMIT = 40;

function tableHtml(grid: TableGrid): string {
  const cls = (index: number): string => {
    const value = ALIGN_CLASS[grid.align[index] ?? ""];
    return value ? ` class="${value}"` : "";
  };

  const head =
    grid.header.length > 0
      ? `<thead><tr>${grid.header
          .map((cell, index) => `<th${cls(index)}>${renderInlineMarkdown(cell)}</th>`)
          .join("")}</tr></thead>`
      : "";
  const body = `<tbody>${grid.rows
    .map(
      (row) =>
        `<tr>${row
          .map((cell, index) => `<td${cls(index)}>${renderInlineMarkdown(cell)}</td>`)
          .join("")}</tr>`,
    )
    .join("")}</tbody>`;

  // 列宽来自分隔行的横线数量；各列等宽时不给 colgroup，保持浏览器自动布局。
  const sized = grid.percents.length > 0;
  const cols = sized
    ? `<colgroup>${grid.percents.map((percent) => `<col style="width:${percent}%">`).join("")}</colgroup>`
    : "";

  return `<table${sized ? ' class="wr-fixed"' : ""}>${cols}${head}${body}</table>`;
}

function htmlFor(raw: string, grid: TableGrid): string | null {
  const hit = htmlCache.get(raw);
  if (hit !== undefined) return hit === "" ? null : hit;

  if (grid.header.length === 0 && grid.rows.length === 0) return null;

  const html = sanitizeHtml(tableHtml(grid));
  if (htmlCache.size >= CACHE_LIMIT) htmlCache.clear();
  htmlCache.set(raw, html);
  return html;
}

/**
 * 单元格区间。
 *
 * 空单元格（`|  |  |  |`）在语法树里**不会生成 TableCell 节点**，
 * 整行会短一截：不补的话渲染出来是一行没有格子的 <tr>，也点不进去。
 * 所以列数不够时改用「两个 `|` 之间」的区间，位置一样准。
 */
function cellsOf(node: SyntaxNode | null, cols: number): CellRange[] {
  if (!node) return [];
  const cells = node.getChildren("TableCell").map((cell) => ({ from: cell.from, to: cell.to }));
  if (cells.length >= cols) return cells.slice(0, cols);

  const delimiters = node.getChildren("TableDelimiter");
  if (delimiters.length >= cols + 1) {
    return Array.from({ length: cols }, (_, index) => ({
      from: delimiters[index]!.to,
      to: delimiters[index + 1]!.from,
    }));
  }
  return cells;
}

function columnsOf(grid: TableGrid): number {
  return Math.max(grid.header.length, grid.align.length, 1);
}

function metaOf(state: EditorState, node: SyntaxNode, grid: TableGrid): TableMeta {
  const cols = columnsOf(grid);
  return {
    from: node.from,
    to: node.to,
    source: state.doc.sliceString(node.from, node.to),
    header: cellsOf(node.getChild("TableHeader"), cols),
    rows: node.getChildren("TableRow").map((row) => cellsOf(row, cols)),
    align: grid.align,
  };
}

function cellAt(meta: TableMeta, rowIndex: number, colIndex: number): CellRange | null {
  if (rowIndex === 0) return meta.header[colIndex] ?? null;
  return meta.rows[rowIndex - 2]?.[colIndex] ?? null;
}

/** 按「第几行第几列」取渲染后的单元格 DOM（行号口径同 table-edit）。 */
function cellElement(
  wrap: HTMLElement,
  rowIndex: number,
  colIndex: number,
): HTMLTableCellElement | null {
  const table = wrap.querySelector("table");
  if (!table) return null;
  if (rowIndex === 0) return table.tHead?.rows[0]?.cells[colIndex] ?? null;
  return table.tBodies[0]?.rows[rowIndex - 2]?.cells[colIndex] ?? null;
}

/** Tab / Shift+Tab 的下一格：表头 → 正文行按顺序排，到头返回 null。 */
function neighborCell(
  meta: TableMeta,
  rowIndex: number,
  colIndex: number,
  direction: -1 | 1,
): { rowIndex: number; colIndex: number } | null {
  const rows = [0, ...meta.rows.map((_, index) => index + 2)];
  const position = rows.indexOf(rowIndex);
  if (position < 0) return null;

  const cols = Math.max(1, meta.header.length);
  const next = position * cols + colIndex + direction;
  if (next < 0 || next >= rows.length * cols) return null;

  return {
    rowIndex: rows[Math.floor(next / cols)] ?? 0,
    colIndex: next % cols,
  };
}

/** 从 DOM 反查「第几行第几列」，行号与 table-edit 的口径一致（0 = 表头，1 = 分隔行）。 */
function locateCell(
  meta: TableMeta,
  target: HTMLElement | null,
): { cell: HTMLTableCellElement; rowIndex: number; colIndex: number } | null {
  const cell = target?.closest("th, td") as HTMLTableCellElement | null;
  if (!cell) return null;

  const table = cell.closest("table");
  if (!table) return null;

  const colIndex = cell.cellIndex;
  if (cell.closest("thead")) {
    return meta.header[colIndex] ? { cell, rowIndex: 0, colIndex } : null;
  }

  const row = cell.parentElement as HTMLTableRowElement | null;
  const body = table.tBodies[0];
  const rowIndex = body && row ? Array.prototype.indexOf.call(body.rows, row) : -1;
  if (rowIndex < 0 || !meta.rows[rowIndex]?.[colIndex]) return null;

  return { cell, rowIndex: rowIndex + 2, colIndex };
}

/**
 * 结构命令要用**当前**文档里的表格位置：单元格刚提交过时，widget 闭包里的
 * from/to/源码都已经是旧的，拿旧源码整表重写会丢掉刚输入的内容。
 */
function freshTarget(
  view: EditorView,
  tableFrom: number,
  rowIndex: number,
  colIndex: number,
): TableTarget | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(tableFrom, 1);
  while (node && node.name !== "Table") node = node.parent;
  if (!node) return null;

  const cols = columnsOf(readTable(view.state.doc.toString(), node));
  const header = cellsOf(node.getChild("TableHeader"), cols);
  const rows = node.getChildren("TableRow").map((row) => cellsOf(row, cols));
  const cell = rowIndex === 0 ? header[colIndex] : rows[rowIndex - 2]?.[colIndex];
  if (!cell) return null;

  return tableAt(view.state.doc.toString(), node.from, node.to, cell.from);
}

interface TableToolbar {
  bar: HTMLElement;
  /** 记住当前操作的单元格（工具条与右键菜单共用）。 */
  remember: (rowIndex: number, colIndex: number) => void;
  /** 对齐按钮的高亮跟着当前列走。 */
  sync: () => void;
}

function buildToolbar(
  view: EditorView,
  meta: TableMeta,
  flush: () => boolean,
): TableToolbar {
  const bar = document.createElement("div");
  bar.className = "cm-md-table-toolbar";

  const current = () =>
    activeTableCell(meta.from) ?? {
      tableFrom: meta.from,
      rowIndex: 0,
      colIndex: 0,
      pos: meta.from,
    };

  const remember = (rowIndex: number, colIndex: number) => {
    const range = cellAt(meta, rowIndex, colIndex);
    setActiveTableCell({
      tableFrom: meta.from,
      rowIndex,
      colIndex,
      pos: range?.from ?? meta.from,
    });
  };

  const sync = () => {
    const align = meta.align[current().colIndex] ?? "";
    for (const el of bar.querySelectorAll<HTMLButtonElement>("[data-align]")) {
      el.setAttribute("aria-pressed", String((el.dataset.align ?? "") === align));
    }
  };

  const command = (name: TableCommand) => {
    // 正在编辑单元格时先提交；一旦文档变了，widget 会重建，这一次点击作废，
    // 否则会拿旧快照去算结构变换（会覆盖刚输入的内容）。
    if (flush()) return;
    const target = freshTarget(view, meta.from, current().rowIndex, current().colIndex);
    if (target) runTableCommand(view, target, name);
  };

  const separator = () => {
    const line = document.createElement("span");
    line.className = "cm-md-tb-sep";
    bar.appendChild(line);
  };

  const button = (
    label: string,
    title: string,
    run: () => void,
    align?: Alignment,
  ): HTMLButtonElement => {
    const el = document.createElement("button");
    el.type = "button";
    el.className = "cm-md-tb";
    el.textContent = label;
    el.title = title;
    el.setAttribute("aria-label", title);
    if (align !== undefined) {
      el.dataset.align = align;
      el.setAttribute("aria-pressed", "false");
    }
    // 不抢单元格输入框的焦点：mousedown 默认会让它 blur 并提前提交
    el.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });
    el.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      run();
    });
    bar.appendChild(el);
    return el;
  };

  button("左", "本列左对齐", () => command("align-left"), "left");
  button("中", "本列居中", () => command("align-center"), "center");
  button("右", "本列右对齐", () => command("align-right"), "right");
  button("—", "本列默认对齐", () => command("align-none"), "");
  separator();
  button("行+", "在下方插入行", () => command("row-below"));
  button("行−", "删除本行", () => command("row-delete"));
  button("列+", "在右侧插入列", () => command("col-right"));
  button("列−", "删除本列", () => command("col-delete"));
  separator();
  button("删表", "删除整张表格", () => command("table-delete"));
  separator();
  // 「看源码」是显式动作：把光标放进表内，走既有的「表内选区 → 退回源码」通道，
  // 移出表格又会自动恢复成表格，不需要额外的状态。
  button("源码", "按 Markdown 源码编辑整张表格", () => {
    if (flush()) return;
    view.dispatch({ selection: { anchor: meta.from + 1 } });
    view.focus();
  });

  sync();
  return { bar, remember, sync };
}

/**
 * 列宽拖拽：手柄放在表头每格右边界上（绝对定位，不测量布局）。
 * 拖动时只改 `<col>` 的像素宽度，松手才把比例写回分隔行 ——
 * 否则每移动一像素都 dispatch 一次，widget 会重建，拖拽直接断掉。
 */
const MIN_COLUMN = 48;

function addColumnResize(view: EditorView, wrap: HTMLElement, meta: TableMeta): void {
  const element = wrap.querySelector("table");
  const headRow = element?.tHead?.rows[0];
  if (!element || !headRow || headRow.cells.length < 2) return;

  const table: HTMLTableElement = element;
  const cells = Array.from(headRow.cells);

  for (let index = 0; index < cells.length - 1; index += 1) {
    const cell = cells[index];
    if (!cell) continue;
    const handle = document.createElement("span");
    handle.className = "cm-md-col-resize";
    handle.setAttribute("aria-hidden", "true");
    cell.appendChild(handle);
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button !== 0) return;
      beginDrag(event, index);
    });
  }

  function beginDrag(event: MouseEvent, index: number): void {
    const startX = event.clientX;
    const widths = cells.map((cell) => cell.getBoundingClientRect().width);
    const left = widths[index] ?? 0;
    const right = widths[index + 1] ?? 0;
    if (left <= 0 || right <= 0) return;

    const total = widths.reduce((sum, width) => sum + width, 0);
    if (total <= 0) return;

    // 拖拽期间切成固定布局：自动布局会按内容重算，手感是「拖不动」
    const hadFixed = table.classList.contains("wr-fixed");
    const originalStyle = table.getAttribute("style");
    table.classList.add("wr-fixed");
    table.style.tableLayout = "fixed";

    let group = table.querySelector("colgroup");
    const createdGroup = group === null;
    if (!group) {
      group = table.insertBefore(document.createElement("colgroup"), table.firstChild);
    }
    const previousCols = Array.from(group.children).map((col) => col.getAttribute("style"));
    group.replaceChildren();
    const cols: HTMLTableColElement[] = [];
    for (let column = 0; column < cells.length; column += 1) {
      const col = document.createElement("col");
      col.style.width = `${widths[column] ?? 0}px`;
      group.appendChild(col);
      cols.push(col);
    }
    const colGroup = group;

    const live = [...widths];
    wrap.classList.add("is-resizing");

    const onMove = (move: MouseEvent): void => {
      const low = MIN_COLUMN - left;
      const high = right - MIN_COLUMN;
      const min = Math.min(low, high);
      const max = Math.max(low, high);
      const delta = Math.max(min, Math.min(max, move.clientX - startX));
      live[index] = Math.max(MIN_COLUMN, left + delta);
      live[index + 1] = Math.max(MIN_COLUMN, right - delta);
      cols.forEach((col, column) => {
        col.style.width = `${live[column] ?? 0}px`;
      });
    };

    const finish = (): void => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      wrap.classList.remove("is-resizing");
    };

    /** 没有写回源码时把 DOM 还原：widget 不会重建，改过的列宽会留在当前 DOM 上。 */
    const restore = (): void => {
      if (createdGroup) {
        colGroup.remove();
      } else {
        colGroup.replaceChildren();
        for (const style of previousCols) {
          const col = document.createElement("col");
          if (style) col.setAttribute("style", style);
          colGroup.appendChild(col);
        }
      }
      table.classList.toggle("wr-fixed", hadFixed);
      if (originalStyle === null) table.removeAttribute("style");
      else table.setAttribute("style", originalStyle);
    };

    const onUp = (): void => {
      const totalWidth = live.reduce((sum, width) => sum + width, 0);
      finish();
      if (totalWidth <= 0) {
        restore();
        return;
      }

      const target = tableAt(meta.source, 0, meta.source.length, 0);
      const change = target
        ? setColumnWidths(
            target,
            live.map((width) => width / totalWidth),
          )
        : null;
      if (!change) {
        restore();
        return;
      }
      view.dispatch({ changes: { from: meta.from, to: meta.to, insert: change.insert } });
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }
}

class TableWidget extends WidgetType {
  constructor(
    readonly html: string,
    readonly signature: string,
    private readonly meta: TableMeta,
  ) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.signature === this.signature;
  }

  /** 宁可估小：估大了会在测出真实高度后让总高度收缩，表现为「往回缩」。 */
  get estimatedHeight(): number {
    const rows = this.meta.rows.length + (this.meta.header.length ? 1 : 0);
    return rows * 30 + 8;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-md-table";
    wrap.innerHTML = this.html;
    addColumnResize(view, wrap, this.meta);

    interface Editing {
      commit: () => boolean;
      cancel: () => void;
    }
    let editing: Editing | null = null;

    const toolbar = buildToolbar(view, this.meta, () => {
      if (!editing) return false;
      const changed = editing.commit();
      editing = null;
      return changed;
    });
    wrap.appendChild(toolbar.bar);

    const beginEdit = (cellEl: HTMLTableCellElement, rowIndex: number, colIndex: number) => {
      if (editing) {
        const changed = editing.commit();
        editing = null;
        // 文档变了 → widget 会重建，这一次点击到此为止，别把输入框挂到旧 DOM 上
        if (changed) return;
      }

      const range = cellAt(this.meta, rowIndex, colIndex);
      if (!range) return;

      const raw = this.meta.source.slice(range.from - this.meta.from, range.to - this.meta.from);
      const lead = /^\s*/.exec(raw)?.[0] ?? "";
      const trail = /\s*$/.exec(raw)?.[0] ?? "";
      const body = raw.slice(lead.length, raw.length - trail.length);

      const input = document.createElement("input");
      input.className = "cm-md-cell-editor";
      input.type = "text";
      input.value = body;
      input.spellcheck = false;
      input.setAttribute("aria-label", "编辑单元格");

      // 叠在单元格上；wrapper 是 position: relative，跟着内容一起滚动。
      const wrapRect = wrap.getBoundingClientRect();
      const rect = cellEl.getBoundingClientRect();
      input.style.left = `${rect.left - wrapRect.left}px`;
      input.style.top = `${rect.top - wrapRect.top}px`;
      input.style.width = `${Math.max(rect.width, 28)}px`;
      input.style.height = `${Math.max(rect.height, 22)}px`;

      let closed = false;
      const close = () => {
        closed = true;
        input.remove();
      };

      const commit = (): boolean => {
        if (closed) return false;
        const next = input.value;
        close();
        if (next === body) return false;
        // 竖线必须转义，否则这一格会被切成两格
        const insert = `${lead}${next.replace(/\|/g, "\\|")}${trail}`;
        view.dispatch({ changes: { from: range.from, to: range.to, insert } });
        return true;
      };

      const cancel = () => {
        if (closed) return;
        close();
        view.focus();
      };

      input.addEventListener("mousedown", (event) => event.stopPropagation());
      input.addEventListener("blur", () => {
        if (closed) return;
        commit();
        editing = null;
      });
      input.addEventListener("keydown", (event) => {
        // 输入法组合期间的回车是「上屏」，不是「提交」
        if (event.isComposing) return;
        // 浮层在 widget 里，事件会一路冒到编辑器；别让编辑器的键位再解释一次
        event.stopPropagation();

        if (event.key === "Enter") {
          event.preventDefault();
          const changed = commit();
          editing = null;
          if (!changed) view.focus();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          cancel();
          editing = null;
          return;
        }

        if (event.key !== "Tab") return;
        event.preventDefault();

        const direction: -1 | 1 = event.shiftKey ? -1 : 1;
        const next = neighborCell(this.meta, rowIndex, colIndex, direction);

        if (!next) {
          if (direction < 0) {
            // 第一格再往前：提交并退出
            const changed = commit();
            editing = null;
            if (!changed) view.focus();
            return;
          }

          // 末尾的 Tab = 追加一行（Typora 的行为），然后进新行第一格
          const rows = this.meta.rows.length;
          const lastRow = rows === 0 ? 0 : rows + 1;
          const cols = Math.max(1, this.meta.header.length);
          const changed = commit();
          editing = null;

          const target = freshTarget(view, this.meta.from, lastRow, Math.min(colIndex, cols - 1));
          if (!target) {
            if (!changed) view.focus();
            return;
          }
          setPendingTableCell(this.meta.from, rows + 2, 0);
          if (!runTableCommand(view, target, "row-below")) {
            takePendingTableCell(this.meta.from);
          }
          return;
        }

        // 先记下下一格再提交：提交会重建 widget，由新 widget 取走并重新打开
        setPendingTableCell(this.meta.from, next.rowIndex, next.colIndex);
        const changed = commit();
        editing = null;
        if (!changed) {
          // 文档没变 → widget 不会重建，直接在当前 DOM 上开下一格
          takePendingTableCell(this.meta.from);
          const cell = cellElement(wrap, next.rowIndex, next.colIndex);
          if (cell) beginEdit(cell, next.rowIndex, next.colIndex);
        }
      });

      wrap.appendChild(input);
      editing = { commit, cancel };
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    };

    wrap.addEventListener("mousedown", (event) => {
      const hit = locateCell(this.meta, event.target as HTMLElement | null);
      if (!hit) return;
      event.preventDefault();
      event.stopPropagation();
      toolbar.remember(hit.rowIndex, hit.colIndex);
      toolbar.sync();
      beginEdit(hit.cell, hit.rowIndex, hit.colIndex);
    });

    // 右键菜单要靠记住的单元格定位（widget 里 posAtCoords 只能给出块起点）
    wrap.addEventListener("contextmenu", (event) => {
      const hit = locateCell(this.meta, event.target as HTMLElement | null);
      if (!hit) return;
      toolbar.remember(hit.rowIndex, hit.colIndex);
      toolbar.sync();
    });

    // Tab 连跳：提交后 widget 重建，这里把下一格重新打开
    const pending = takePendingTableCell(this.meta.from);
    if (pending) {
      const cell = cellElement(wrap, pending.rowIndex, pending.colIndex);
      if (cell) {
        window.setTimeout(() => {
          if (!wrap.isConnected) return;
          toolbar.remember(pending.rowIndex, pending.colIndex);
          toolbar.sync();
          beginEdit(cell, pending.rowIndex, pending.colIndex);
        }, 0);
      }
    }

    return wrap;
  }

  /** 单元格点击、工具条按钮都由 widget 自己处理，不再交给 CodeMirror。 */
  ignoreEvent(): boolean {
    return true;
  }
}

function build(state: EditorState): DecorationSet {
  const source = state.doc.toString();
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Table") return;

      // 块级 replace 里放不下光标。只有程序化把选区送进表内（搜索跳转、逐字选择）
      // 时才放弃 widget，让源码可见；点击单元格走的是浮层，不会到这里。
      const caretInside = state.selection.ranges.some(
        (range) => range.from > node.from && range.to < node.to,
      );
      if (caretInside) return;

      const raw = state.doc.sliceString(node.from, node.to);
      const grid = readTable(source, node.node);
      const html = htmlFor(raw, grid);
      if (!html) return;

      const meta = metaOf(state, node.node, grid);
      const signature = `${html}|${meta.header.map((cell) => cell.from).join(",")}|${meta.rows
        .map((row) => row.map((cell) => cell.from).join(","))
        .join(";")}`;

      ranges.push(
        Decoration.replace({
          widget: new TableWidget(html, signature, meta),
          block: true,
        }).range(state.doc.lineAt(node.from).from, state.doc.lineAt(node.to).to),
      );
    },
  });

  return Decoration.set(ranges, true);
}

export function tableBlocks(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return build(state);
    },
    update(value, tr) {
      if (tr.docChanged || tr.selection) return build(tr.state);
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
