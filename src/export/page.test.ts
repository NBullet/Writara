import { describe, expect, it } from "vitest";

import { applyPagePreview, resolvePage } from "./page";

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

  it("A4 横向交换纸张宽高", () => {
    const page = resolvePage({ paper: "a4-landscape", margin: "normal" });
    expect(page.orientation).toBe("landscape");
    expect(page.size).toBe("A4 landscape");
    expect(page.paperWidthMm).toBe(297);
    expect(page.paperHeightMm).toBe(210);
    // 横向正文宽 = 297 - 16 × 2，高 = 210 - 14 - 16（横向常规上下边距单独收紧）
    expect(page.contentWidthMm).toBe(265);
    expect(page.contentHeightMm).toBe(188);
    expect(page.margins).toEqual([10, 16, 12, 16]);
    expect(page.sheetWidthMm).toBe(297);
    expect(page.css).toContain("size: A4 landscape");
  });

  it("自适应默认纵向，屏幕纸面铺满", () => {
    const page = resolvePage({ paper: "auto", margin: "normal" });
    expect(page.orientation).toBe("portrait");
    expect(page.size).toBe("A4");
    expect(page.sheetWidthMm).toBeNull();
    expect(page.contentWidthMm).toBe(178);
  });

  it("自适应按内容换成横向后仍是一张真实 A4", () => {
    const page = resolvePage({ paper: "auto", margin: "normal", orientation: "landscape" });
    expect(page.orientation).toBe("landscape");
    expect(page.size).toBe("A4 landscape");
    expect(page.paperWidthMm).toBe(297);
    expect(page.css).toContain("margin: 10mm 16mm 12mm 16mm");
  });

  it("非法预设回落到 A4 常规", () => {
    const page = resolvePage({ paper: "b5" as never, margin: "huge" as never });
    expect(page.paper).toBe("a4");
    expect(page.orientation).toBe("portrait");
    expect(page.size).toBe("A4");
    expect(page.margins).toEqual([20, 16, 22, 16]);
  });
});

describe("applyPagePreview", () => {
  function fakeRoot() {
    const values: Record<string, string> = {};
    const root = {
      style: {
        setProperty(name: string, value: string) {
          values[name] = value;
        },
      },
    } as unknown as HTMLElement;
    return { root, values };
  }

  it("固定版面按纸张宽度铺纸，页边距跟着预设", () => {
    const { root, values } = fakeRoot();
    applyPagePreview({ paper: "a4-landscape", margin: "narrow" }, root);
    expect(values["--wr-page-pad"]).toBe("12mm");
    expect(values["--wr-page-width"]).toContain("max(297mm");
  });

  it("自适应铺满可用宽度", () => {
    const { root, values } = fakeRoot();
    applyPagePreview({ paper: "auto", margin: "normal" }, root);
    expect(values["--wr-page-width"]).toBe("100%");
    expect(values["--wr-page-pad"]).toBe("16mm");
  });
});
