import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Extension, Range, StateEffectType } from "@codemirror/state";
import { StateField } from "@codemirror/state";

import { renderMermaidSvg } from "../../export/mermaid";
import { isDarkPalette } from "../../export/theme-vars";
import { createPreviewPanel } from "./block-edit";
import { blockTouched } from "./focus";

/**
 * ```mermaid 代码块 → 图表。
 *
 * - 阅读态：整块换成渲染后的图（异步占位 + requestMeasure）；
 * - 编辑态（光标在块内）：源码留在原位，块后挂实时预览面板（边写边看），
 *   与 Typora 的 `.md-diagram-panel` 同一套语义。
 *
 * 渲染是异步的：面板先给「渲染中…」，300ms 防抖后出图；改一行期间保留上一版，
 * 不把面板清空（清空会让高度表抖、看起来像闪屏）。
 */

const cache = new Map<string, Promise<string | null>>();
const CACHE_LIMIT = 40;

/** 每个预览面板的待渲染计时器（以 body 元素为键）。 */
const timers = new WeakMap<HTMLElement, number>();

function svgFor(source: string, dark: boolean): Promise<string | null> {
  const key = `${dark ? "d" : "l"}|${source}`;
  let promise = cache.get(key);
  if (!promise) {
    promise = renderMermaidSvg(source, dark);
    if (cache.size >= CACHE_LIMIT) cache.clear();
    cache.set(key, promise);
  }
  return promise;
}

class MermaidWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly dark: boolean,
    private readonly from: number,
  ) {
    super();
  }

  eq(other: MermaidWidget): boolean {
    return other.source === this.source && other.dark === this.dark && other.from === this.from;
  }

  /** 图表高度差异很大；取偏小值，宁可让总高度变大也不让它收缩。 */
  get estimatedHeight(): number {
    return 200;
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement("div");
    host.className = "cm-md-mermaid is-loading";
    host.textContent = "Mermaid 渲染中…";
    // 预留高度，避免异步渲染完成时把下面的内容整体推下去。
    host.style.minHeight = `${this.estimatedHeight}px`;

    host.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from },
        effects: EditorView.scrollIntoView(this.from, { y: "nearest" }),
      });
      view.focus();
    });

    void svgFor(this.source, this.dark).then((svg) => {
      if (!host.isConnected) return;
      host.classList.remove("is-loading");
      if (svg) {
        host.innerHTML = svg;
      } else {
        host.classList.add("is-error");
        host.textContent = "Mermaid 渲染失败（点击查看源码）";
      }
      view.requestMeasure();
    });

    return host;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

class MermaidPreviewWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly dark: boolean,
    private readonly blockTo: number,
  ) {
    super();
  }

  eq(other: MermaidPreviewWidget): boolean {
    return (
      other.source === this.source && other.dark === this.dark && other.blockTo === this.blockTo
    );
  }

  get estimatedHeight(): number {
    return 220;
  }

  toDOM(view: EditorView): HTMLElement {
    const panel = createPreviewPanel("图表预览", view, this.blockTo);
    panel.host.classList.add("cm-md-mermaid-preview");
    panel.body.textContent = "渲染中…";
    scheduleRender(panel.host, panel.body, panel.status, this.source, this.dark, view);
    return panel.host;
  }

  /** 源码每变一次都走这里：不重建面板，保留上一版图，防抖后换新。 */
  updateDOM(dom: HTMLElement, view: EditorView): boolean {
    dom.dataset.blockTo = String(this.blockTo);
    const body = dom.querySelector<HTMLElement>(".cm-md-preview-body");
    const status = dom.querySelector<HTMLElement>(".cm-md-preview-status");
    if (!body || !status) return false;
    scheduleRender(dom, body, status, this.source, this.dark, view);
    return true;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

function scheduleRender(
  host: HTMLElement,
  body: HTMLElement,
  status: HTMLElement,
  source: string,
  dark: boolean,
  view: EditorView,
): void {
  const pending = timers.get(body);
  if (pending !== undefined) window.clearTimeout(pending);

  host.dataset.state = "pending";
  status.textContent = "更新中…";

  const timer = window.setTimeout(() => {
    timers.delete(body);
    void svgFor(source, dark).then((svg) => {
      if (!body.isConnected) return;
      if (svg) {
        body.innerHTML = svg;
        host.dataset.state = "ready";
        status.textContent = "";
      } else {
        host.dataset.state = "error";
        status.textContent = "语法错误";
        // 有上一版就留着，别把图换成一串报错
        if (!body.querySelector("svg")) body.textContent = "Mermaid 渲染失败";
      }
      view.requestMeasure();
    });
  }, 300);
  timers.set(body, timer);
}

/** 光标所在的 mermaid 围栏（供 Mod-Enter / Esc 与 ✓ 使用）。 */
export function mermaidBlockAt(state: EditorState, pos: number): { from: number; to: number } | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (node.name === "FencedCode") {
      const info = node.getChild("CodeInfo");
      const language = info ? state.doc.sliceString(info.from, info.to).trim().toLowerCase() : "";
      if (language === "mermaid") return { from: node.from, to: node.to };
    }
    node = node.parent;
  }
  return null;
}

function build(state: EditorState): DecorationSet {
  const dark = isDarkPalette();
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "FencedCode") return;
      const info = node.node.getChild("CodeInfo");
      const text = node.node.getChild("CodeText");
      if (!info || !text) return;

      const language = state.doc.sliceString(info.from, info.to).trim().toLowerCase();
      if (language !== "mermaid") return;

      const source = state.doc.sliceString(text.from, text.to);
      if (!source.trim()) return;

      if (blockTouched(state, node.from, node.to)) {
        ranges.push(
          Decoration.widget({
            widget: new MermaidPreviewWidget(source, dark, node.to),
            block: true,
            side: 1,
          }).range(state.doc.lineAt(node.to).to),
        );
        return;
      }

      ranges.push(
        Decoration.replace({
          // 点击图表进入编辑态；光标落在代码首行（不是围栏行），一进来就能改源码
          widget: new MermaidWidget(source, dark, text.from),
          block: true,
        }).range(state.doc.lineAt(node.from).from, state.doc.lineAt(node.to).to),
      );
    },
  });

  return Decoration.set(ranges, true);
}

export function mermaidBlocks(refresh: StateEffectType<null>): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return build(state);
    },
    update(value, tr) {
      if (tr.docChanged || tr.selection || tr.effects.some((effect) => effect.is(refresh))) {
        return build(tr.state);
      }
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
