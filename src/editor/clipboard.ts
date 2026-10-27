import type { EditorView } from "@codemirror/view";

import { toPlainText } from "../markdown/plain-text";
import { renderMarkdown } from "../markdown/render";

/** 复制/剪切/粘贴：优先用异步剪贴板，失败返回 false，由调用方提示。 */

export type CopyKind = "markdown" | "plain" | "html" | "rich";

export interface SelectionChunk {
  text: string;
  from: number;
  to: number;
}

/** 取选区；没有选区时取当前行（与 Typora 的「复制当前行」一致）。 */
export function selectionOrLine(view: EditorView): SelectionChunk {
  const range = view.state.selection.main;
  if (!range.empty) {
    return { text: view.state.sliceDoc(range.from, range.to), from: range.from, to: range.to };
  }
  const line = view.state.doc.lineAt(range.head);
  return { text: line.text, from: line.from, to: line.to };
}

async function writeClipboard(payload: { text: string; html?: string }): Promise<boolean> {
  try {
    if (payload.html && typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/plain": new Blob([payload.text], { type: "text/plain" }),
          "text/html": new Blob([payload.html], { type: "text/html" }),
        }),
      ]);
      return true;
    }
    await navigator.clipboard.writeText(payload.text);
    return true;
  } catch {
    return false;
  }
}

export async function copyAs(view: EditorView, kind: CopyKind): Promise<boolean> {
  const { text } = selectionOrLine(view);
  if (!text) return false;

  if (kind === "markdown") return writeClipboard({ text });
  if (kind === "plain") return writeClipboard({ text: toPlainText(text) });

  const html = renderMarkdown(text);
  if (kind === "html") return writeClipboard({ text: html });
  return writeClipboard({ text: toPlainText(text), html });
}

export async function cutSelection(view: EditorView): Promise<boolean> {
  const range = view.state.selection.main;
  if (range.empty) return false;
  const ok = await writeClipboard({ text: view.state.sliceDoc(range.from, range.to) });
  if (!ok) return false;
  view.dispatch({ changes: { from: range.from, to: range.to } });
  view.focus();
  return true;
}

export async function pasteText(view: EditorView): Promise<boolean> {
  try {
    const text = await navigator.clipboard.readText();
    if (!text) return false;
    const range = view.state.selection.main;
    view.dispatch({
      changes: { from: range.from, to: range.to, insert: text },
      selection: { anchor: range.from + text.length },
    });
    view.focus();
    return true;
  } catch {
    return false;
  }
}
