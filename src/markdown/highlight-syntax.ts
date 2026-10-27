import type { MarkdownConfig } from "@lezer/markdown";
import { tags } from "@lezer/highlight";

/**
 * Typora 的 `==高亮==`。
 * 用行内解析器而不是正则：这样代码块/行内代码里的 `==` 不会被误判。
 */

const EQUALS = 61;

export const HighlightSyntax: MarkdownConfig = {
  defineNodes: [
    { name: "Highlight", style: { "Highlight/...": tags.emphasis } },
    { name: "HighlightMark", style: tags.processingInstruction },
  ],
  parseInline: [
    {
      name: "Highlight",
      before: "Emphasis",
      parse(cx, next, pos) {
        if (next !== EQUALS) return -1;
        if (cx.slice(pos, pos + 2) !== "==") return -1;

        const rest = cx.slice(pos + 2, cx.end);
        const line = rest.split("\n", 1)[0] ?? "";
        const close = line.indexOf("==");
        if (close <= 0) return -1;

        const end = pos + 2 + close + 2;
        cx.addElement(
          cx.elt("Highlight", pos, end, [
            cx.elt("HighlightMark", pos, pos + 2),
            cx.elt("HighlightMark", end - 2, end),
          ]),
        );
        return end;
      },
    },
  ],
};
