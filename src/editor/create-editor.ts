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
        }),
        EditorView.domEventHandlers({
          compositionend(_event, view) {
            // 组合提交后补一次同步：无论 CodeMirror 是否再派发事务，
            // React 都能拿到最终文本与光标。
            queueMicrotask(() => {
              if (!view.dom.isConnected) return;
              sync(view, { force: true });
            });
            return false;
          },
        }),
      ],
    }),
  });
}
