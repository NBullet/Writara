import { markdownLanguage } from "@codemirror/lang-markdown";
import type { MarkdownParser } from "@lezer/markdown";

import { CaretSyntax } from "./caret-syntax";
import { HighlightSyntax } from "./highlight-syntax";
import { MathSyntax } from "./math-syntax";

/**
 * 全应用共用一个 Markdown 解析器配置：GFM + 上下标 + emoji（来自 markdownLanguage）
 * 再加上 `==高亮==` 与 `$行内公式$`。
 * 编辑器与导出必须用同一份，否则「看到」和「打出」会不一致。
 */
export const writaraParser = (markdownLanguage.parser as MarkdownParser).configure([
  CaretSyntax,
  HighlightSyntax,
  MathSyntax,
]);

export { CaretSyntax, HighlightSyntax, MathSyntax };
