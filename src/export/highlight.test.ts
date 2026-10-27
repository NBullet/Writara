// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { highlightCodeBlocks } from "./highlight";

describe("highlightCodeBlocks", () => {
  it("给已知语言加上 token 类", async () => {
    const html = await highlightCodeBlocks('<pre><code class="language-ts">const a = 1;</code></pre>');
    expect(html).toContain("hljs-keyword");
    expect(html).toContain("hljs-number");
  });

  it("未知语言保持原样", async () => {
    const source = '<pre><code class="language-unknownlang">x = 1</code></pre>';
    expect(await highlightCodeBlocks(source)).toBe(source);
  });

  it("没有代码块时原样返回", async () => {
    const source = "<p>正文</p>";
    expect(await highlightCodeBlocks(source)).toBe(source);
  });

  it("转义过的代码不会被破坏", async () => {
    const html = await highlightCodeBlocks(
      '<pre><code class="language-html">&lt;div class="a"&gt;x&lt;/div&gt;</code></pre>',
    );
    expect(html).toContain("hljs-tag");
    expect(html).toContain("div");
  });
});
