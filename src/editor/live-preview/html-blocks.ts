import { syntaxTree } from "@codemirror/language";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { StateField } from "@codemirror/state";

import { sanitizeHtml } from "../../markdown/sanitize";
import { createPreviewPanel } from "./block-edit";
import { blockTouched } from "./focus";

/**
 * HTML 块 → 渲染结果。
 *
 * - 阅读态：整块换成清洗后的 HTML（与打印 / 导出同一条 sanitize 管线）；
 * - 编辑态（光标在块内）：源码留在原位（等宽 + 左侧色条），块后挂实时预览。
 *
 * 边界：
 * - 独立 `<svg>` 块交给 svg-blocks.ts（同一个 HTMLBlock 节点，不能两边都 replace）；
 * - 注释块是 CommentBlock（不是 HTMLBlock），仍然按源码显示；
 * - `<script>` / `<iframe>` / `<video>` 等被 sanitize 丢弃，内容是空白时退回源码，
 *   不要用一个空块把内容吃掉。
 */

const EDIT_LINE = Decoration.line({ class: "cm-md-html-edit" });
const SVG_BLOCK = /^<svg[\s>][\s\S]*<\/svg\s*>$/i;

const cache = new Map<string, string | null>();
const CACHE_LIMIT = 60;

export function htmlMarkup(source: string): string | null {
  const hit = cache.get(source);
  if (hit !== undefined) return hit;

  const html = sanitizeHtml(source).trim();
  const result = html === "" ? null : html;
  if (cache.size >= CACHE_LIMIT) cache.clear();
  cache.set(source, result);
  return result;
}

class HtmlBlockWidget extends WidgetType {
  constructor(
    readonly markup: string,
    private readonly from: number,
  ) {
    super();
  }

  eq(other: HtmlBlockWidget): boolean {
    return other.markup === this.markup && other.from === this.from;
  }

  /** 不知道真实高度，取偏小值：宁可总高度变大，也不让它收缩。 */
  get estimatedHeight(): number {
    return 60;
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement("div");
    host.className = "cm-md-html";
    host.innerHTML = this.markup;

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

class HtmlPreviewWidget extends WidgetType {
  constructor(
    readonly source: string,
    private readonly blockTo: number,
  ) {
    super();
  }

  eq(other: HtmlPreviewWidget): boolean {
    return other.source === this.source && other.blockTo === this.blockTo;
  }

  get estimatedHeight(): number {
    return 80;
  }

  toDOM(view: EditorView): HTMLElement {
    const panel = createPreviewPanel("HTML 预览", view, this.blockTo);
    panel.host.classList.add("cm-md-html-preview");
    renderHtml(panel.body, panel.status, this.source);
    return panel.host;
  }

  updateDOM(dom: HTMLElement): boolean {
    dom.dataset.blockTo = String(this.blockTo);
    const body = dom.querySelector<HTMLElement>(".cm-md-preview-body");
    const status = dom.querySelector<HTMLElement>(".cm-md-preview-status");
    if (!body || !status) return false;
    renderHtml(body, status, this.source);
    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function renderHtml(body: HTMLElement, status: HTMLElement, source: string): void {
  const markup = htmlMarkup(source);
  body.classList.toggle("is-empty", !markup);
  if (markup) {
    body.innerHTML = markup;
    status.textContent = "";
  } else {
    body.textContent = "没有可渲染的 HTML（标签被清洗或内容为空）";
    status.textContent = "";
  }
}

/** 只关心容器标签；空元素（img/br/…）不参与配对。 */
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input",
  "link", "meta", "source", "track", "wbr",
]);

/**
 * 这段 HTML 还没闭合的标签（取最外层那个）。
 *
 * CommonMark 的 HTMLBlock 遇到空行就结束，所以 `<details>` 里夹一段空行会把块劈成两半，
 * 各自渲染时折叠内容就散出来了。这里按标签配对把相邻块重新接起来。
 */
export function unclosedTag(text: string): string | null {
  const stack: string[] = [];
  const pattern = /<\/?([a-zA-Z][\w-]*)(?:\s[^>]*)?\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    const name = (match[1] ?? "").toLowerCase();
    if (!name || VOID_TAGS.has(name)) continue;
    if (match[0].startsWith("</")) {
      const at = stack.lastIndexOf(name);
      if (at >= 0) stack.length = at;
    } else if (!match[0].endsWith("/>")) {
      stack.push(name);
    }
  }
  return stack[0] ?? null;
}

/** 后面（含当前块）还有没有闭合标签，避免把没写完的 `<div>` 一路吞到文末。 */
function closesLater(text: string, name: string): boolean {
  return new RegExp(`</${name}\\s*>`, "i").test(text);
}

interface BlockRange {
  from: number;
  to: number;
}

/** 收集 HTMLBlock，并把被空行劈开的同一个容器接回一段。 */
export function mergeHtmlBlocks(state: EditorState): BlockRange[] {
  const blocks: BlockRange[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "HTMLBlock") blocks.push({ from: node.from, to: node.to });
    },
  });

  const merged: BlockRange[] = [];
  for (const block of blocks) {
    const last = merged[merged.length - 1];
    if (last) {
      const open = unclosedTag(state.doc.sliceString(last.from, last.to));
      if (open && closesLater(state.doc.sliceString(block.from, state.doc.length), open)) {
        last.to = block.to;
        continue;
      }
    }
    merged.push({ ...block });
  }
  return merged;
}

function build(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];

  for (const block of mergeHtmlBlocks(state)) {
    const raw = state.doc.sliceString(block.from, block.to).trim();
    if (!raw) continue;
    // 独立图形块由 svg-blocks.ts 负责，同一个区间不能挂两个 block replace
    if (SVG_BLOCK.test(raw)) continue;

    const firstLine = state.doc.lineAt(block.from).number;
    const lastLine = state.doc.lineAt(block.to).number;

    if (blockTouched(state, block.from, block.to)) {
      for (let number = firstLine; number <= lastLine; number += 1) {
        ranges.push(EDIT_LINE.range(state.doc.line(number).from));
      }
      ranges.push(
        Decoration.widget({
          widget: new HtmlPreviewWidget(raw, block.to),
          block: true,
          side: 1,
        }).range(state.doc.lineAt(block.to).to),
      );
      continue;
    }

    const markup = htmlMarkup(raw);
    if (!markup) continue; // 清洗后为空 → 保留源码，别制造一个空块

    ranges.push(
      Decoration.replace({
        widget: new HtmlBlockWidget(markup, state.doc.lineAt(block.from).from),
        block: true,
      }).range(state.doc.lineAt(block.from).from, state.doc.lineAt(block.to).to),
    );
  }

  return Decoration.set(ranges, true);
}

export function htmlBlocks(): Extension {
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
