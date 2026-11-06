import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { parseFrontMatter } from "../markdown/frontmatter";
import { writaraExtensions } from "./extensions";

export interface CreateEditorOptions {
  parent: HTMLElement;
  doc: string;
  onChange?: (doc: string) => void;
  /** 选区变化时回调选中文本（用于状态栏字数）。 */
  onSelection?: (text: string) => void;
}

/** 打开文档时的光标位置：跳过 YAML Front Matter 与它后面的空行，落在正文第一行。 */
export function initialCaret(doc: string): number {
  const front = parseFrontMatter(doc);
  if (!front) return 0;
  const rest = doc.slice(front.to);
  const blanks = /^(?:[ \t]*\r?\n)+/.exec(rest)?.[0].length ?? 0;
  return Math.min(front.to + blanks, doc.length);
}

export function createEditor({ parent, doc, onChange, onSelection }: CreateEditorOptions): EditorView {
  /** 把编辑器状态同步给 React；组合期间不调用，避免打断输入法。 */
  const sync = (
    view: EditorView,
    options: { docChanged?: boolean; force?: boolean } = {},
  ) => {
    if (view.composing && !options.force) return;
    if (options.force || options.docChanged) onChange?.(view.state.doc.toString());
    const range = view.state.selection.main;
    onSelection?.(view.state.sliceDoc(range.from, range.to));
  };

  /** 组合输入的起点：提交后光标应该落在「起点 + 插入字数」之后。 */
  let composing: { head: number; length: number } | null = null;

  /** 只在出现异常时记一行，不刷屏：光标被回弹到刚输入的字符前面时。 */
  const noteCaretJump = (view: EditorView, expected: number, data: string): void => {
    const head = view.state.selection.main.head;
    if (head >= expected) return;
    const around = view.state.doc.sliceString(Math.max(0, head - 16), Math.min(view.state.doc.length, head + 16));
    window.writara?.log({
      level: "warn",
      scope: "ime",
      message: `输入后光标回退：应在 ${expected} 之后，实际 ${head}`,
      stack: `数据=${JSON.stringify(data)}\n附近=${JSON.stringify(around)}`,
    });
  };

  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: { anchor: initialCaret(doc) },
      // 注意：不把 onChange 交给 writaraExtensions 的内部监听器，
      // 否则输入法组合期间每个拼音字母都会触发一次 React 重渲染，
      // 长文档里就会和输入法互相拖累（候选闪烁、光标跳）。
      extensions: [
        ...writaraExtensions(),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged && !update.selectionSet) return;
          if (update.view.composing) return;
          sync(update.view, { docChanged: update.docChanged });

          // 全角标点是「光标乱跑」最常出现的输入：插完光标应在它后面。
          if (!update.docChanged || !update.state.selection.main.empty) return;
          update.changes.iterChanges((_fromA, _toA, _fromB, toB, inserted) => {
            const text = inserted.toString();
            if (text.length !== 1 || !/[，。；：！？、]/.test(text)) return;
            noteCaretJump(update.view, toB, text);
          });
        }),
        EditorView.domEventHandlers({
          compositionstart(_event, view) {
            const range = view.state.selection.main;
            composing = { head: range.head, length: view.state.doc.length };
            return false;
          },
          compositionend(event, view) {
            const started = composing;
            composing = null;
            const data = event.data ?? "";
            // CodeMirror 的 DOM observer 在 compositionend 之后才把提交写进文档。
            // `queueMicrotask` 会读到提交前的旧文本（React 拿到旧文本，随后的渲染
            // 和输入法抢同一帧）；等一拍再补同步。
            setTimeout(() => {
              if (!view.dom.isConnected) return;
              sync(view, { force: true });
              const inserted = view.state.doc.length - (started?.length ?? view.state.doc.length);
              if (started && inserted > 0) noteCaretJump(view, started.head + inserted, data);
            }, 0);
            return false;
          },
        }),
      ],
    }),
  });
}
