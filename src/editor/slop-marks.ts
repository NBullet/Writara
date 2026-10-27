import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, EditorView, type DecorationSet } from "@codemirror/view";

import type { SlopHit, SlopKind } from "../ai/antislop";

/**
 * 反 AI 腔的标记层。
 *
 * 规则层默认「先标记、再应用」：扫描结果进 StateField，编辑器只负责画出来；
 * 用户看到位置才决定是否清理。文档一变标记立刻清空 —— 宁可丢失标记，
 * 也不要让旧偏移画到别的句子上。
 */

export const setSlopMarks = StateEffect.define<SlopHit[]>();
export const clearSlopMarks = StateEffect.define<null>();

const TITLES: Record<SlopKind, string> = {
  phrase: "过场话（套话）",
  emoji: "正文里的 emoji",
  bold: "列表腔：整句加粗短语",
  tail: "打圆场的收尾段",
};

const marks: Record<SlopKind, Decoration> = {
  phrase: Decoration.mark({ class: "cm-slop-mark is-phrase", attributes: { title: TITLES.phrase } }),
  emoji: Decoration.mark({ class: "cm-slop-mark is-emoji", attributes: { title: TITLES.emoji } }),
  bold: Decoration.mark({ class: "cm-slop-mark is-bold", attributes: { title: TITLES.bold } }),
  tail: Decoration.mark({ class: "cm-slop-mark is-tail", attributes: { title: TITLES.tail } }),
};

export const slopMarksField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, transaction) {
    for (const effect of transaction.effects) {
      if (effect.is(clearSlopMarks)) return Decoration.none;
      if (effect.is(setSlopMarks)) {
        const ranges = effect.value
          .filter((hit) => hit.to > hit.from)
          .map((hit) => marks[hit.kind].range(hit.from, hit.to));
        return Decoration.set(ranges, true);
      }
    }
    if (transaction.docChanged) return Decoration.none;
    return decorations;
  },
  provide: (field) => EditorView.decorations.from(field),
});
