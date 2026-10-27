import type { CompletionContext } from "@codemirror/autocomplete";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { fenceLanguageSource } from "./language-completion";

function complete(doc: string, pos = doc.length) {
  const state = EditorState.create({ doc });
  const context = { state, pos, explicit: false } as unknown as CompletionContext;
  return fenceLanguageSource(context);
}

describe("fenceLanguageSource", () => {
  it("在围栏后给出语言补全，替换范围只覆盖语言 token", () => {
    const result = complete("```py");
    expect(result?.from).toBe(3);
    expect(result?.options.some((option) => option.label === "python")).toBe(true);
    expect(result?.options.some((option) => option.label === "mermaid")).toBe(true);
  });

  it("支持 ~~~ 与缩进", () => {
    const result = complete("  ~~~js");
    expect(result?.from).toBe(5);
    expect(result?.options.some((option) => option.label === "javascript")).toBe(true);
  });

  it("正文里不触发", () => {
    expect(complete("普通文字 py")).toBeNull();
    expect(complete("```python\nprint(1)")).toBeNull();
  });
});
