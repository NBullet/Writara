import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * 智能标点：直引号转弯引号、`--` 转破折号、`...` 转省略号。
 * 只在设置打开时启用。
 */

export interface SmartEdit {
  /** 需要一并替换掉的、光标前的字符数。 */
  removeBefore: number;
  insert: string;
}

const OPEN_BEFORE = /[\s([{<"'“‘（【《]/;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export function smartPunctuationFor(char: string, before: string, after: string): SmartEdit | null {
  const previous = before.slice(-1);
  const next = after.slice(0, 1);

  if (char === '"') {
    if (before === "" || OPEN_BEFORE.test(previous)) return { removeBefore: 0, insert: "“" };
    if (next === "" || /[\s.,!?;:)\]}>]/.test(next)) return { removeBefore: 0, insert: "”" };
    return { removeBefore: 0, insert: "”" };
  }

  if (char === "'") {
    if (LETTER_OR_DIGIT.test(previous)) return { removeBefore: 0, insert: "’" };
    if (before === "" || OPEN_BEFORE.test(previous)) return { removeBefore: 0, insert: "‘" };
    return { removeBefore: 0, insert: "’" };
  }

  if (char === "-" && previous === "-") return { removeBefore: 1, insert: "—" };
  if (char === "." && before.endsWith("..")) return { removeBefore: 2, insert: "…" };

  return null;
}

export function smartPunctuation(): Extension {
  return EditorView.inputHandler.of((view, from, to, text) => {
    if (text.length !== 1 || from !== to) return false;
    const state = view.state;
    const before = state.sliceDoc(Math.max(0, from - 2), from);
    const after = state.sliceDoc(to, Math.min(state.doc.length, to + 1));
    const edit = smartPunctuationFor(text, before, after);
    if (!edit) return false;

    const start = Math.max(0, from - edit.removeBefore);
    view.dispatch({
      changes: { from: start, to, insert: edit.insert },
      selection: { anchor: start + edit.insert.length },
    });
    return true;
  });
}
