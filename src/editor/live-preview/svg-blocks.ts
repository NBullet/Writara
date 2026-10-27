import type { Extension, Text, EditorState, Transaction } from "@codemirror/state";
import { StateField } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

import { sanitizeSvg } from "../../markdown/sanitize";
import { createPreviewPanel, type EditableBlock } from "./block-edit";
import { blockTouched } from "./focus";

/**
 * `<svg>…</svg>` 独立块 → 图形。
 *
 * 为什么要单独一个 StateField：CodeMirror 只允许「状态层」提供块级装饰，
 * ViewPlugin 里放 block widget 会抛 "Block decorations may not be specified via plugins"。
 * 代价是这里拿不到 viewport，只能按文档扫描 —— 所以：
 *
 * - 全文扫描只在「文档里确实有 <svg」之后才做，普通长文档打字时零开销；
 * - 只有选区变化时复用上次的扫描结果，只重算「光标是否进入该块」；
 * - 扫描结果缓存进字段值，避免每次 dispatch 重新分配。
 */

export interface SvgBlock {
  from: number;
  to: number;
  source: string;
}

export interface SvgFieldValue {
  blocks: SvgBlock[];
  /** 文档里是否出现过 `<svg`；false 时任何不影响 svg 的编辑都不用重扫。 */
  hasSvg: boolean;
  decorations: DecorationSet;
}

const FENCE = /^\s*(?:```|~~~)/;
const SVG_OPEN = /^ {0,3}<svg[\s>]/i;
const SVG_CLOSE = /<\/svg\s*>\s*$/i;
const SVG_MARK = /<svg/i;
const EDIT_LINE = Decoration.line({ class: "cm-md-svg-edit" });

/** 逐行扫描，跳过围栏代码块；返回完整行区间。 */
function scan(doc: Text): { blocks: SvgBlock[]; hasSvg: boolean } {
  const markdown = doc.toString();
  if (!SVG_MARK.test(markdown)) return { blocks: [], hasSvg: false };

  const blocks: SvgBlock[] = [];
  let inFence = false;
  let open: { from: number; lines: string[] } | null = null;

  for (let number = 1; number <= doc.lines; number += 1) {
    const line = doc.line(number);

    if (open) {
      open.lines.push(line.text);
      if (SVG_CLOSE.test(line.text)) {
        blocks.push({ from: open.from, to: line.to, source: open.lines.join("\n") });
        open = null;
      }
      continue;
    }

    if (FENCE.test(line.text)) {
      inFence = !inFence;
      continue;
    }

    if (inFence) continue;

    if (SVG_OPEN.test(line.text)) {
      // 单行就闭合的情况
      if (SVG_CLOSE.test(line.text)) {
        blocks.push({ from: line.from, to: line.to, source: line.text });
      } else {
        open = { from: line.from, lines: [line.text] };
      }
    }
  }

  return { blocks, hasSvg: true };
}

/** 对外保留纯函数入口（测试与打印预览共用）。 */
export function findSvgBlocks(doc: Text): SvgBlock[] {
  return scan(doc).blocks;
}

/**
 * 取变更区间所覆盖的整行文本。
 * 判定用整行而不是精确区间：`<svg` 与 `</svg` 都可能被拆成几次按键输入。
 */
function changedLines(doc: Text, from: number, to: number): string {
  const start = doc.lineAt(from).from;
  const end = doc.lineAt(to).to;
  return doc.sliceString(start, end);
}

/** 变更是否可能让文档开始/停止包含 `<svg`（新增或删除）。 */
function touchesSvgMarkup(tr: Transaction): boolean {
  let touched = false;
  tr.changes.iterChangedRanges((fromA, toA, fromB, toB) => {
    if (touched) return;
    if (SVG_MARK.test(changedLines(tr.startState.doc, fromA, toA))) touched = true;
    if (SVG_MARK.test(changedLines(tr.state.doc, fromB, toB))) touched = true;
  });
  return touched;
}

const cache = new Map<string, string | null>();
const CACHE_LIMIT = 60;

/** 估算 svg 高度：内容宽约 664px，按 viewBox 的宽高比换算；刻意取偏小值。 */
function estimateHeight(markup: string): number {
  const box = /viewBox\s*=\s*["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)/i.exec(markup);
  if (box) {
    const width = Number(box[1]);
    const height = Number(box[2]);
    if (width > 0 && height > 0) return Math.round(Math.min(664, width) * (height / width) * 0.9);
  }
  return 120;
}

export function svgMarkup(source: string): string | null {
  const hit = cache.get(source);
  if (hit !== undefined) return hit;

  const markup = sanitizeSvg(source);
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(source, markup);
  return markup;
}

class SvgBlockWidget extends WidgetType {
  private readonly estimated: number;

  constructor(
    readonly markup: string,
    private readonly from: number,
  ) {
    super();
    this.estimated = estimateHeight(markup);
  }

  /**
   * 还没渲染时的估算高度。
   * 不给的话 CodeMirror 会按行高猜，滚过之后总量突然变化，
   * 表现为滚动条长度乱跳、已经滚下去又被拉回一点。
   */
  get estimatedHeight(): number {
    return this.estimated;
  }

  eq(other: SvgBlockWidget): boolean {
    return other.markup === this.markup && other.from === this.from;
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement("div");
    host.className = "cm-md-svg";
    host.innerHTML = this.markup;

    // 点击图形 → 光标落到源码块开头；否则会按 x 坐标落到 </svg> 那一行。
    host.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from },
        effects: EditorView.scrollIntoView(this.from, { y: "nearest" }),
      });
      view.focus();
    });

    return host;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function overlaps(state: EditorState, block: SvgBlock): boolean {
  return blockTouched(state, block.from, block.to);
}

/** 编辑态下挂在线输的预览面板：SVG 是同步渲染，不需要防抖。 */
class SvgPreviewWidget extends WidgetType {
  constructor(
    readonly source: string,
    private readonly blockTo: number,
  ) {
    super();
  }

  get estimatedHeight(): number {
    const markup = svgMarkup(this.source) ?? "";
    return Math.max(80, estimateHeight(markup) + 40);
  }

  eq(other: SvgPreviewWidget): boolean {
    return other.source === this.source && other.blockTo === this.blockTo;
  }

  toDOM(view: EditorView): HTMLElement {
    const panel = createPreviewPanel("SVG 预览", view, this.blockTo);
    panel.host.classList.add("cm-md-svg-preview");
    this.render(panel.body, panel.status);
    return panel.host;
  }

  updateDOM(dom: HTMLElement): boolean {
    const body = dom.querySelector<HTMLElement>(".cm-md-preview-body");
    const status = dom.querySelector<HTMLElement>(".cm-md-preview-status");
    if (!body || !status) return false;
    this.render(body, status);
    return true;
  }

  private render(body: HTMLElement, status: HTMLElement): void {
    const markup = svgMarkup(this.source);
    if (markup) {
      body.classList.remove("is-empty");
      body.innerHTML = markup;
      status.textContent = "";
    } else {
      body.classList.add("is-empty");
      body.textContent = "这段 SVG 无法渲染（标签被清洗或语法不完整）";
      status.textContent = "有误";
    }
  }

  ignoreEvent(): boolean {
    return true;
  }
}

/** 光标所在的 SVG 块（Esc / Mod-Enter 退出编辑态用）。 */
export function svgBlockAt(state: EditorState, pos: number): EditableBlock | null {
  for (const block of findSvgBlocks(state.doc)) {
    if (pos >= block.from && pos <= block.to) return { from: block.from, to: block.to };
  }
  return null;
}

function decorate(state: EditorState, blocks: SvgBlock[]): DecorationSet {
  const ranges = [];
  for (const block of blocks) {
    if (overlaps(state, block)) {
      // 编辑态：源码留在原位（等宽 + 左侧色条），块后挂实时预览
      const first = state.doc.lineAt(block.from).number;
      const last = state.doc.lineAt(block.to).number;
      for (let number = first; number <= last; number += 1) {
        ranges.push(EDIT_LINE.range(state.doc.line(number).from));
      }
      ranges.push(
        Decoration.widget({
          widget: new SvgPreviewWidget(block.source, block.to),
          block: true,
          side: 1,
        }).range(state.doc.lineAt(block.to).to),
      );
      continue;
    }

    const markup = svgMarkup(block.source);
    if (!markup) continue; // 清洗失败就保留源码
    ranges.push(
      Decoration.replace({ widget: new SvgBlockWidget(markup, block.from), block: true }).range(block.from, block.to),
    );
  }
  return Decoration.set(ranges, true);
}

export function svgBlocks(): Extension {
  return StateField.define<SvgFieldValue>({
    create(state) {
      const { blocks, hasSvg } = scan(state.doc);
      return { blocks, hasSvg, decorations: decorate(state, blocks) };
    },

    update(value, tr) {
      if (!tr.docChanged) {
        // 只是移动光标 / 点击：块位置没变，重算「是否露出源码」即可，不重扫全文。
        return tr.selection
          ? { ...value, decorations: decorate(tr.state, value.blocks) }
          : value;
      }

      // 文档里没有 <svg，且这次改动碰不到 <svg：结构不可能变，直接复用。
      if (!value.hasSvg && !touchesSvgMarkup(tr)) return value;

      const { blocks, hasSvg } = scan(tr.state.doc);
      return { blocks, hasSvg, decorations: decorate(tr.state, blocks) };
    },

    provide: (field) => EditorView.decorations.from(field, (value) => value.decorations),
  });
}
