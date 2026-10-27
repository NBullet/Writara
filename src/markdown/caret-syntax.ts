import type { InlineContext, MarkdownExtension } from "@lezer/markdown";

/**
 * 内置 `Superscript` 的替代实现，只改一处：`^` 紧跟在 `[` 后面时不做上标。
 *
 * 原因：`[^1]` 是脚注引用。内置规则会一直找到下一个 `^` 才收尾，
 * 于是 `脚注[^1]，第二个[^2]。` 被解析成一个横跨两个引用的上标，
 * 链接的 `]` 被吞掉，脚注编号查不到，编辑器与打印都退化成原文 `[^1]`。
 *
 * 其余行为（`x^2^`、遇到空白中止、反斜杠转义）与内置实现一致。
 */
const CaretSyntax: MarkdownExtension = {
  parseInline: [
    {
      name: "Superscript",
      parse(cx: InlineContext, next: number, pos: number) {
        if (next !== 94 /* ^ */ || cx.char(pos + 1) === 94) return -1;
        // `[^` 交给链接解析器：那是脚注标记，不是上标。
        if (cx.char(pos - 1) === 91 /* [ */) return -1;

        const marks = [cx.elt("SuperscriptMark", pos, pos + 1)];
        for (let i = pos + 1; i < cx.end; i += 1) {
          const code = cx.char(i);
          if (code === 94) {
            return cx.addElement(
              cx.elt("Superscript", pos, i + 1, marks.concat(cx.elt("SuperscriptMark", i, i + 1))),
            );
          }
          if (code === 92 /* \ */) {
            marks.push(cx.elt("Escape", i, i + 2));
            i += 1;
          } else if (code === 32 || code === 9 || code === 10) {
            break;
          }
        }
        return -1;
      },
    },
  ],
};

export { CaretSyntax };
