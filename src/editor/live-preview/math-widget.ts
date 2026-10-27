import { EditorView, WidgetType } from "@codemirror/view";

import { renderMathHtml } from "../../markdown/math";
import { createPreviewPanel } from "./block-edit";

/** KaTeX 渲染结果缓存：每次按键都会重建装饰，公式文本通常不变。 */
const cache = new Map<string, string | null>();
const LIMIT = 80;

export function mathHtml(tex: string, display: boolean): string | null {
  const key = `${display ? "D" : "I"}${tex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const html = renderMathHtml(tex, display);
  if (cache.size >= LIMIT) cache.clear();
  cache.set(key, html);
  return html;
}

export class InlineMathWidget extends WidgetType {
  constructor(readonly tex: string) {
    super();
  }

  eq(other: InlineMathWidget): boolean {
    return other.tex === this.tex;
  }

  toDOM(): HTMLElement {
    const host = document.createElement("span");
    host.className = "cm-md-math";
    const html = mathHtml(this.tex, false);
    if (html) {
      host.innerHTML = html;
    } else {
      host.classList.add("is-error");
      host.textContent = `$${this.tex}$`;
    }
    return host;
  }

  /** 点击交给 CodeMirror，光标进来后显示源码。 */
  ignoreEvent(): boolean {
    return false;
  }
}

export class MathBlockWidget extends WidgetType {
  constructor(
    readonly tex: string,
    private readonly from: number,
  ) {
    super();
  }

  eq(other: MathBlockWidget): boolean {
    return other.tex === this.tex && other.from === this.from;
  }

  /** 单行块级公式；取偏小值，避免总高度收缩。 */
  get estimatedHeight(): number {
    return 56;
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement("div");
    host.className = "cm-md-math-block";
    const html = mathHtml(this.tex, true);
    if (html) {
      host.innerHTML = html;
    } else {
      host.textContent = `$$${this.tex}$$`;
    }

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

/**
 * 编辑态下方挂的公式预览（块末尾的 block widget）。
 *
 * 与阅读态的 MathBlockWidget 互斥：光标在块里时显示源码 + 这个面板，
 * 离开后整个块换回 KaTeX。TeX 每敲一个字都会变，用 updateDOM 就地重渲染，
 * 不重建面板（重建会闪，也会让高度表抖）。
 */
export class MathPreviewWidget extends WidgetType {
  constructor(
    readonly tex: string,
    private readonly blockTo: number,
  ) {
    super();
  }

  eq(other: MathPreviewWidget): boolean {
    return other.tex === this.tex && other.blockTo === this.blockTo;
  }

  /** 取偏小值：测出真实高度后总高度只会变大。 */
  get estimatedHeight(): number {
    return 88;
  }

  toDOM(view: EditorView): HTMLElement {
    const panel = createPreviewPanel("公式预览", view, this.blockTo);
    panel.host.classList.add("cm-md-math-preview");
    renderMath(panel.body, panel.status, this.tex);
    return panel.host;
  }

  updateDOM(dom: HTMLElement): boolean {
    dom.dataset.blockTo = String(this.blockTo);
    const body = dom.querySelector<HTMLElement>(".cm-md-preview-body");
    const status = dom.querySelector<HTMLElement>(".cm-md-preview-status");
    if (!body || !status) return false;
    renderMath(body, status, this.tex);
    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function renderMath(body: HTMLElement, status: HTMLElement, tex: string): void {
  const html = mathHtml(tex, true);
  body.classList.toggle("is-error", !html);
  if (html) {
    body.innerHTML = html;
    status.textContent = "";
    return;
  }
  const text = tex.trim();
  body.textContent = text || "空公式";
  status.textContent = "语法错误";
}
