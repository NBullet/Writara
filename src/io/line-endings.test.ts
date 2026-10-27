import { describe, expect, it } from "vitest";

import { applyLineEnding, detectLineEnding, normalizeLineEndings } from "./line-endings";

describe("line endings", () => {
  it("检测 CRLF 与 LF", () => {
    expect(detectLineEnding("a\r\nb")).toBe("crlf");
    expect(detectLineEnding("a\nb")).toBe("lf");
    expect(detectLineEnding("单行")).toBe("lf");
  });

  it("打开时归一，保存时还原", () => {
    const crlf = "第一行\r\n第二行\r\n";
    const normalized = normalizeLineEndings(crlf);
    expect(normalized).toBe("第一行\n第二行\n");
    expect(applyLineEnding(normalized, "crlf")).toBe(crlf);
    expect(applyLineEnding(normalized, "lf")).toBe(normalized);
  });
});
