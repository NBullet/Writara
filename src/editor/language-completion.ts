import type { CompletionContext, CompletionResult } from "@codemirror/autocomplete";

import { CODE_LANGUAGES } from "./languages";

const OPTIONS = CODE_LANGUAGES.map((language) => ({
  label: language.id,
  detail: language.name,
  type: "keyword",
}));

const FENCE_INFO = /^(\s*)(?:```+|~~~+)([\w#+.-]*)$/;

/**
 * 围栏语言补全：在 ```` ```py ```` 这种位置弹出语言列表。
 * 只匹配「行首围栏 + 纯语言 token」，不会影响正文。
 */
export function fenceLanguageSource(context: CompletionContext): CompletionResult | null {
  const line = context.state.doc.lineAt(context.pos);
  const before = context.state.sliceDoc(line.from, context.pos);
  const match = FENCE_INFO.exec(before);
  if (!match) return null;

  const from = line.from + before.length - (match[2]?.length ?? 0);
  return {
    from,
    options: OPTIONS,
    validFor: /^[\w#+.-]*$/,
  };
}
