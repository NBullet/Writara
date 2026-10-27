import type { MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

/** 行内公式 `$...$`。块级 `$$...$$` 由段落识别处理（见 render.ts / math-blocks.ts）。 */

const DOLLAR = 36;

export const MathSyntax: MarkdownConfig = {
  defineNodes: [
    { name: "InlineMath", style: { "InlineMath/...": tags.monospace } },
    { name: "MathMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "InlineMath",
      before: "Emphasis",
      parse(cx, next, pos) {
        if (next !== DOLLAR) return -1;
        // $$ 交给块级处理；第二个 $ 不再作为开始
        if (cx.slice(pos, pos + 2) === "$$") return -1;
        if (cx.slice(pos - 1, pos) === "$") return -1;

        const rest = cx.slice(pos + 1, cx.end);
        const line = rest.split("\n", 1)[0] ?? "";
        const close = line.indexOf("$");
        if (close <= 0) return -1;

        // `$5 和 $6` 这类价格不当作公式
        const after = rest[close + 1] ?? "";
        if (/\d/.test(after)) return -1;

        const end = pos + 1 + close + 1;
        cx.addElement(
          cx.elt("InlineMath", pos, end, [
            cx.elt("MathMark", pos, pos + 1),
            cx.elt("MathMark", end - 1, end),
          ]),
        );
        return end;
      },
    },
  ],
};
