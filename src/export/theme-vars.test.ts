// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { isDarkPalette, relativeLuminance, themeCss, themeVariables } from "./theme-vars";

describe("relativeLuminance", () => {
  it("黑白两端", () => {
    expect(relativeLuminance("#ffffff")).toBe(1);
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("rgb(255, 255, 255)")).toBe(1);
  });

  it("短写的十六进制", () => {
    expect(relativeLuminance("#fff")).toBe(1);
    expect(relativeLuminance("#000")).toBe(0);
  });

  it("无法解析时按浅色处理", () => {
    expect(relativeLuminance("not-a-color")).toBe(1);
  });
});

describe("themeVariables / themeCss", () => {
  it("从内联变量读取", () => {
    const root = document.createElement("div");
    root.style.setProperty("--wr-bg", "#123456");
    root.style.setProperty("--wr-text", "#abcdef");

    expect(themeVariables(root)).toEqual([
      ["--wr-bg", "#123456"],
      ["--wr-text", "#abcdef"],
    ]);
    expect(themeCss(root)).toContain("--wr-bg: #123456;");
  });

  it("没有变量时返回空字符串", () => {
    const root = document.createElement("div");
    expect(themeVariables(root)).toEqual([]);
    expect(themeCss(root)).toBe("");
  });
});

describe("isDarkPalette", () => {
  it("根据背景亮度判断", () => {
    const dark = document.createElement("div");
    dark.style.setProperty("--wr-bg", "#1e1e1e");
    const light = document.createElement("div");
    light.style.setProperty("--wr-bg", "#f7f5f0");

    expect(isDarkPalette(dark)).toBe(true);
    expect(isDarkPalette(light)).toBe(false);
  });
});
