import { describe, expect, it } from "vitest";

import { resolvePage } from "./page";

describe("resolvePage", () => {
  it("A4 常规边距", () => {
    const page = resolvePage({ paper: "a4", margin: "normal" });
    expect(page.size).toBe("A4");
    expect(page.margins).toEqual([20, 16, 22, 16]);
    expect(page.contentHeightMm).toBe(255);
    // A4 减去左右各 16mm = 178mm，默认 42rem（177.8mm）刚好放得下
    expect(page.contentWidthMm).toBe(178);
    expect(page.css).toContain("@page");
    expect(page.css).toContain("size: A4");
    expect(page.css).toContain("20mm 16mm 22mm 16mm");
  });

  it("Letter 窄边距", () => {
    const page = resolvePage({ paper: "letter", margin: "narrow" });
    expect(page.size).toBe("Letter");
    expect(page.margins).toEqual([12, 12, 14, 12]);
    expect(page.contentHeightMm).toBeCloseTo(253.4, 1);
  });

  it("非法预设回落到 A4 常规", () => {
    const page = resolvePage({ paper: "b5" as never, margin: "huge" as never });
    expect(page.size).toBe("A4");
    expect(page.margins).toEqual([20, 16, 22, 16]);
  });
});
