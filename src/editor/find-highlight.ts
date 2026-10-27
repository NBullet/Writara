import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import type { FindMatch } from "./find";

/**
 * 查找高亮：面板把匹配列表推进状态，编辑器只负责画出来。
 * 走 StateField 而不是 ViewPlugin，块级装饰的限制才不会踩到。
 */

export const setFindMatches = StateEffect.define<{ matches: FindMatch[]; current: number }>();
export const clearFindMatches = StateEffect.define<null>();

const matchMark = Decoration.mark({ class: "cm-find-match" });
const currentMark = Decoration.mark({ class: "cm-find-match cm-find-match-current" });

export const findHighlightField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(clearFindMatches)) return Decoration.none;
      if (effect.is(setFindMatches)) {
        const { matches, current } = effect.value;
        const ranges = matches.map((match, index) =>
          (index === current ? currentMark : matchMark).range(match.from, match.to),
        );
        return Decoration.set(ranges, true);
      }
    }
    if (transaction.docChanged) return decorations.map(transaction.changes);
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});
