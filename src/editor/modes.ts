import type { Extension } from "@codemirror/state";
import { Compartment } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { indentUnit, syntaxTree } from "@codemirror/language";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, GutterMarker, ViewPlugin, gutter } from "@codemirror/view";
import { StateField } from "@codemirror/state";

import { livePreview } from "./live-preview";
import { blockEditingKeys } from "./live-preview/block-edit";
import { bottomSpace } from "./live-preview/bottom-space";
import { frontMatterBlocks } from "./live-preview/front-matter";
import { htmlBlocks } from "./live-preview/html-blocks";
import { mathBlockAt, mathBlocks } from "./live-preview/math-blocks";
import { mermaidBlockAt, mermaidBlocks } from "./live-preview/mermaid-blocks";
import { refreshPreviewEffect } from "./live-preview/refresh";
import { svgBlockAt, svgBlocks } from "./live-preview/svg-blocks";
import { tableBlocks } from "./live-preview/table-blocks";
import { tocBlocks } from "./live-preview/toc-blocks";
import { imageToolbar } from "./image-toolbar";
import { linkClick } from "./link-click";
import { smartPunctuation } from "./smart-punctuation";

/**
 * 视图模式（源码 / 专注 / 打字机）都用 Compartment 运行时切换，
 * 避免为了一个开关重建整个 EditorView（会丢光标与撤销历史）。
 */

export const previewCompartment = new Compartment();
export const modeCompartment = new Compartment();
export const optionsCompartment = new Compartment();

/** 主题 / 图片解析器变化时让需要重绘的 widget（Mermaid、图片）重建。 */
export { refreshPreviewEffect } from "./live-preview/refresh";

export function refreshPreview(view: EditorView): void {
  view.dispatch({ effects: refreshPreviewEffect.of(null) });
}

const previewExtensions = (): Extension[] => [
  livePreview(),
  svgBlocks(),
  htmlBlocks(),
  tableBlocks(),
  tocBlocks(),
  mathBlocks(),
  mermaidBlocks(refreshPreviewEffect),
  // 公式块 / 图表块的编辑态：Mod-Enter、Esc 退出（不在块里时让给别的处理器）
  blockEditingKeys(
    (state, pos) => mathBlockAt(state, pos) ?? mermaidBlockAt(state, pos) ?? svgBlockAt(state, pos),
  ),
  imageToolbar(),
  frontMatterBlocks(),
  bottomSpace(),
  linkClick(),
];

function previewContent(sourceMode: boolean): Extension[] {
  return sourceMode ? [EditorView.editorAttributes.of({ class: "cm-source-mode" })] : previewExtensions();
}

export function previewExtension(sourceMode: boolean): Extension {
  return previewCompartment.of(previewContent(sourceMode));
}

/** 当前行加类，供专注模式把其余行变淡。 */
function activeLineField(): Extension {
  return StateField.define<DecorationSet>({
    create: (state) =>
      Decoration.set([
        Decoration.line({ class: "cm-md-active-line" }).range(
          state.doc.lineAt(state.selection.main.head).from,
        ),
      ]),
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value;
      return Decoration.set([
        Decoration.line({ class: "cm-md-active-line" }).range(
          tr.state.doc.lineAt(tr.state.selection.main.head).from,
        ),
      ]);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

/** 打字机模式：让光标所在行保持在视口中央。 */
function typewriter(): Extension {
  return ViewPlugin.fromClass(
    class {
      private scheduled = false;

      constructor(private readonly view: EditorView) {}

      update(update: { selectionSet: boolean; view: EditorView }) {
        if (!update.selectionSet || update.view.composing) return;
        if (this.scheduled) return;
        this.scheduled = true;
        requestAnimationFrame(() => {
          this.scheduled = false;
          // 组合期间不要滚动/派发，和 live preview 的 IME 规则一致。
          if (this.view.composing) return;
          const pos = this.view.state.selection.main.head;
          this.view.dispatch({
            effects: EditorView.scrollIntoView(pos, { y: "center" }),
          });
        });
      }
    },
  );
}

export interface ViewModes {
  focus: boolean;
  typewriter: boolean;
}

export function modeExtension(modes: ViewModes): Extension {
  return modeCompartment.of(modeContent(modes));
}

function modeContent(modes: ViewModes): Extension[] {
  const extensions: Extension[] = [activeLineField()];
  if (modes.focus) extensions.push(EditorView.editorAttributes.of({ class: "cm-focus" }));
  if (modes.typewriter) extensions.push(typewriter());
  return extensions;
}

export function setSourceMode(view: EditorView, enabled: boolean): void {
  view.dispatch({ effects: previewCompartment.reconfigure(previewContent(enabled)) });
}

export function setViewModes(view: EditorView, modes: ViewModes): void {
  view.dispatch({ effects: modeCompartment.reconfigure(modeContent(modes)) });
}

export interface EditorOptions {
  spellcheck: boolean;
  smartPunctuation: boolean;
  /** 代码块显示行号（按块重新计数）。 */
  codeLineNumbers?: boolean;
  /** 缩进宽度（空格数）。 */
  codeIndent?: number;
}

/** 代码块行号：只在围栏/缩进代码块内显示，按块从 1 开始。 */
const codeLineNumbers = (): Extension =>
  gutter({
    class: "cm-code-gutter",
    lineMarker(view, block) {
      let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(block.from, 1);
      let code: SyntaxNode | null = null;
      while (node) {
        if (node.name === "FencedCode" || node.name === "CodeBlock") {
          code = node;
          break;
        }
        node = node.parent;
      }
      if (!code) return null;

      const text = code.getChild("CodeText");
      if (!text) return null;
      if (block.from < text.from || block.from > text.to) return null;

      const first = view.state.doc.lineAt(text.from).number;
      const current = view.state.doc.lineAt(block.from).number;
      return new CodeLineMarker(String(current - first + 1));
    },
  });

class CodeLineMarker extends GutterMarker {
  constructor(private readonly label: string) {
    super();
  }

  eq(other: CodeLineMarker): boolean {
    return other.label === this.label;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-code-line-no";
    span.textContent = this.label;
    return span;
  }
}

function optionsContent(options: EditorOptions): Extension[] {
  const extensions: Extension[] = [
    EditorView.contentAttributes.of({ spellcheck: options.spellcheck ? "true" : "false" }),
  ];
  if (options.smartPunctuation) extensions.push(smartPunctuation());
  if (options.codeIndent) extensions.push(indentUnit.of(" ".repeat(options.codeIndent)));
  if (options.codeLineNumbers) extensions.push(codeLineNumbers());
  return extensions;
}

export function editorOptions(options: EditorOptions): Extension {
  return optionsCompartment.of(optionsContent(options));
}

export function setEditorOptions(view: EditorView, options: EditorOptions): void {
  view.dispatch({ effects: optionsCompartment.reconfigure(optionsContent(options)) });
}
