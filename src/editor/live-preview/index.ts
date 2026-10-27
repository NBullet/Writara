import { syntaxTree } from "@codemirror/language";
import type { Extension, Range } from "@codemirror/state";
import type { DecorationSet, EditorView, ViewUpdate } from "@codemirror/view";
import { Decoration, ViewPlugin } from "@codemirror/view";
import type { Tree } from "@lezer/common";

import { collectEdits } from "./analyze";
import { BulletWidget } from "./bullet-widget";
import { EmojiWidget } from "./emoji-widget";
import { FootnoteWidget } from "./footnote-widget";
import { LanguageBadgeWidget } from "./language-widget";
import { InlineMathWidget } from "./math-widget";
import { mathScanFor } from "./math-blocks";
import { refreshPreviewEffect } from "./refresh";
import { ImageWidget } from "./image-widget";
import { TaskWidget } from "./task-widget";

const hidden = Decoration.replace({});

const lineDecorations = new Map<string, Decoration>();
const markDecorations = new Map<string, Decoration>();

function lineDecoration(cls: string): Decoration {
  let deco = lineDecorations.get(cls);
  if (!deco) {
    deco = Decoration.line({ class: cls });
    lineDecorations.set(cls, deco);
  }
  return deco;
}

function markDecoration(cls: string): Decoration {
  let deco = markDecorations.get(cls);
  if (!deco) {
    deco = Decoration.mark({ class: cls });
    markDecorations.set(cls, deco);
  }
  return deco;
}

function build(view: EditorView, tree: Tree): DecorationSet {
  const { state } = view;
  const edits = collectEdits(state.doc, tree, state.selection.ranges, view.visibleRanges);
  // 行内公式也要解析 `\eqref`：编号结果是全文档的，按文档对象缓存（见 math-blocks.ts）。
  let inlineMath: ((tex: string) => string) | null = null;

  /** 替换装饰不能跨行：跨行的编辑器内部会抛错，这里跳过并留一条开发期日志。 */
  const crossesLine = (from: number, to: number): boolean =>
    state.doc.lineAt(from).number !== state.doc.lineAt(to).number;

  const ranges: Range<Decoration>[] = [];
  for (const edit of edits) {
    switch (edit.kind) {
      case "hide":
        if (crossesLine(edit.from, edit.to)) {
          if (import.meta.env.DEV) console.warn("[writara] 跳过跨行隐藏", edit);
          break;
        }
        ranges.push(hidden.range(edit.from, edit.to));
        break;
      case "line":
        ranges.push(lineDecoration(edit.cls).range(edit.from));
        break;
      case "mark":
        ranges.push(markDecoration(edit.cls).range(edit.from, edit.to));
        break;
      case "task":
        if (crossesLine(edit.from, edit.to)) break;
        ranges.push(
          Decoration.replace({
            widget: new TaskWidget(edit.checked, edit.from, edit.to, view),
          }).range(edit.from, edit.to),
        );
        break;
      case "bullet":
        if (crossesLine(edit.from, edit.to)) break;
        ranges.push(
          Decoration.replace({ widget: new BulletWidget(edit.depth) }).range(edit.from, edit.to),
        );
        break;
      case "emoji":
        if (crossesLine(edit.from, edit.to)) break;
        ranges.push(
          Decoration.replace({ widget: new EmojiWidget(edit.char) }).range(edit.from, edit.to),
        );
        break;
      case "math":
        if (crossesLine(edit.from, edit.to)) break;
        inlineMath ??= mathScanFor(state).inline;
        ranges.push(
          Decoration.replace({ widget: new InlineMathWidget(inlineMath(edit.tex)) }).range(
            edit.from,
            edit.to,
          ),
        );
        break;
      case "footnote":
        if (crossesLine(edit.from, edit.to)) break;
        ranges.push(
          Decoration.replace({ widget: new FootnoteWidget(edit.id) }).range(edit.from, edit.to),
        );
        break;
      case "lang":
        ranges.push(
          Decoration.widget({ widget: new LanguageBadgeWidget(edit.text), side: -1 }).range(edit.from),
        );
        break;
      case "image":
        if (crossesLine(edit.from, edit.to)) break;
        ranges.push(
          Decoration.replace({
            widget: new ImageWidget(
              edit.src,
              edit.alt,
              edit.title,
              edit.width,
              edit.height,
              view,
              edit.from,
              edit.to,
            ),
          }).range(edit.from, edit.to),
        );
        break;
    }
  }

  return Decoration.set(ranges, true);
}

class LivePreviewPlugin {
  decorations: DecorationSet;
  /**
   * 语法树是增量解析的：首次构建时可能只解析了一部分，
   * 解析推进后 Language 会 dispatch 一个没有 doc/selection 变化的更新。
   * 这里比对语法树引用，确保那一次也能重建装饰。
   */
  private tree: Tree;

  constructor(view: EditorView) {
    this.tree = syntaxTree(view.state);
    this.decorations = build(view, this.tree);
  }

  update(update: ViewUpdate) {
    // 输入法组合期间不要重建装饰：替换 DOM 会打断候选/上屏。
    if (update.view.composing) return;

    const tree = syntaxTree(update.state);
    const refreshRequested = update.transactions.some((transaction) =>
      transaction.effects.some((effect) => effect.is(refreshPreviewEffect)),
    );
    if (
      refreshRequested ||
      update.docChanged ||
      update.selectionSet ||
      update.viewportChanged ||
      tree !== this.tree
    ) {
      this.tree = tree;
      this.decorations = build(update.view, tree);
    }
  }
}

/**
 * Typora 式即时渲染：视口内的 Markdown 标记默认隐藏。
 * 行内标记只在光标触到它所属的那个 span 时露出（见 focus.ts）；
 * 块级标记（标题、引用、围栏、列表符号）在整块/整行范围内露出。
 */
export function livePreview(): Extension {
  return ViewPlugin.fromClass(LivePreviewPlugin, {
    decorations: (plugin: LivePreviewPlugin) => plugin.decorations,
  });
}
