import { describe, expect, it } from "vitest";

import { inlineKatexFonts } from "./katexCss";

describe("inlineKatexFonts", () => {
  it("只替换已知的 woff2，保留其他格式", () => {
    const css = `src:url(fonts/KaTeX_Main-Regular.woff2) format("woff2"),url(fonts/KaTeX_Main-Regular.woff) format("woff")`;
    const out = inlineKatexFonts(css, { "KaTeX_Main-Regular.woff2": "data:font/woff2;base64,AAAA" });
    expect(out).toContain("url(data:font/woff2;base64,AAAA)");
    expect(out).toContain("url(fonts/KaTeX_Main-Regular.woff)");
  });

  it("未知字体保持原样", () => {
    const css = "url(fonts/Unknown.woff2)";
    expect(inlineKatexFonts(css, {})).toBe(css);
  });
});
