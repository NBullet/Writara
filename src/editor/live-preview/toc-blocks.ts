import { syntaxTree } from "@codemirror/language";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { StateField } from "@codemirror/state";

import { collectOutline, type OutlineItem } from "../../markdown/outline";
import { blockTouched } from "./focus";

/**
 * `[TOC]` 段落 → 可点击目录。
 *
 * 与表格/SVG 一样走 StateField（块级装饰不能由 ViewPlugin 提供）。
 * 点击条目直接跳到对应标题；光标进入该行则退回源码。
 */

const TOC_LINE = /^\[toc\]$/i;

class TocWidget extends WidgetType {
  constructor(
    readonly items: OutlineItem[],
    private readonly from = 0,
    private readonly to = 0,
  ) {
    super();
  }

  /**
   * 估算高度要**偏小**，不能偏大。
   * 偏大时：真实高度测出来更小 → 总高度收缩 → 滚动位置被钳制 → 出现「往回缩」。
   * 偏小时：总高度只会变大，视口位置由 CodeMirror 自行校正，用户看不到跳动。
   */
  get estimatedHeight(): number {
    return this.items.length * 28 + 12;
  }

  eq(other: TocWidget): boolean {
    if (other.items.length !== this.items.length) return false;
    if (other.from !== this.from || other.to !== this.to) return false;
    return other.items.every(
      (item, index) =>
        item.from === this.items[index]?.from && item.text === this.items[index]?.text,
    );
  }

  toDOM(): HTMLElement {
    const nav = document.createElement("div");
    nav.className = "cm-md-toc";

    // 悬浮工具条：刷新（重新收集标题）/ 移除（删掉 [TOC] 这一行）
    const tools = document.createElement("div");
    tools.className = "cm-md-toc-tools";
    const tool = (label: string, title: string, run: (view: EditorView) => void) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "cm-md-tb";
      el.textContent = label;
      el.title = title;
      el.setAttribute("aria-label", title);
      el.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
      });
      el.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const editor = nav.closest(".cm-editor");
        const view = editor ? EditorView.findFromDOM(editor as HTMLElement) : null;
        if (view) run(view);
      });
      tools.appendChild(el);
    };
    tool("刷新", "重新收集标题", (view) => {
      // 用一次空选区事务触发重建（TOC 的内容是 build 时从文档算出来的）
      view.dispatch({ selection: { anchor: view.state.selection.main.head } });
    });
    tool("移除", "删除这个目录块", (view) => {
      const doc = view.state.doc;
      const from = Math.min(this.from, doc.length);
      const line = doc.lineAt(from);
      const end = Math.min(Math.max(this.to, line.to), doc.length);
      const to = doc.sliceString(end, end + 1) === "\n" ? end + 1 : end;
      view.dispatch({
        changes: { from: line.from, to, insert: "" },
        selection: { anchor: Math.min(line.from, Math.max(0, doc.length - (to - line.from))) },
      });
      view.focus();
    });
    nav.appendChild(tools);

    if (this.items.length === 0) {
      nav.appendChild(document.createTextNode("（还没有标题）"));
      return nav;
    }

    const list = document.createElement("ul");
    for (const item of this.items) {
      const row = document.createElement("li");
      row.className = `lv${item.level}`;
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = item.text;
      button.title = item.text;
      button.addEventListener("mousedown", (event) => {
        event.preventDefault();
        const editor = nav.closest(".cm-editor");
        if (!editor) return;
        const view = EditorView.findFromDOM(editor as HTMLElement);
        if (!view) return;
        view.dispatch({
          selection: { anchor: item.from },
          effects: EditorView.scrollIntoView(item.from, { y: "center" }),
        });
        view.focus();
      });
      row.appendChild(button);
      list.appendChild(row);
    }
    nav.appendChild(list);
    return nav;
  }

  /** 点击由目录自己处理，不要让 CodeMirror 把光标放进 widget。 */
  ignoreEvent(): boolean {
    return true;
  }
}

function build(state: EditorState): DecorationSet {
  const source = state.doc.toString();
  if (!/\[toc\]/i.test(source)) return Decoration.none;

  const items = collectOutline(source);
  const ranges: Range<Decoration>[] = [];

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Paragraph") return;
      if (!TOC_LINE.test(state.doc.sliceString(node.from, node.to).trim())) return;
      if (blockTouched(state, node.from, node.to)) return;

      ranges.push(
        Decoration.replace({
          widget: new TocWidget(items, state.doc.lineAt(node.from).from, state.doc.lineAt(node.to).to),
          block: true,
        }).range(state.doc.lineAt(node.from).from, state.doc.lineAt(node.to).to),
      );
    },
  });

  return Decoration.set(ranges, true);
}

export function tocBlocks(): Extension {
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
