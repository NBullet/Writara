// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  DEFAULT_SETTINGS,
  LIMITS,
  applyCustomCss,
  applySettings,
  loadSettings,
  normalizeSettings,
  sanitizeCustomCss,
  saveSettings,
} from "./settings";

describe("normalizeSettings", () => {
  it("缺字段时回落到默认值", () => {
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
  });

  it("字号与栏宽被夹到安全范围", () => {
    const tiny = normalizeSettings({ fontSize: 1, measure: 1, autosaveDelay: 1 });
    expect(tiny.fontSize).toBe(LIMITS.fontSize.min);
    expect(tiny.measure).toBe(LIMITS.measure.min);
    expect(tiny.autosaveDelay).toBe(LIMITS.autosaveDelay.min);

    const huge = normalizeSettings({ fontSize: 999, measure: 999, autosaveDelay: 99999 });
    expect(huge.fontSize).toBe(LIMITS.fontSize.max);
    expect(huge.measure).toBe(LIMITS.measure.max);
    expect(huge.autosaveDelay).toBe(LIMITS.autosaveDelay.max);
  });

  it("非法主题回到跟随系统", () => {
    expect(normalizeSettings({ theme: "neon" as never }).theme).toBe("system");
  });

  it("NaN 不会写进 CSS", () => {
    const settings = normalizeSettings({ fontSize: Number.NaN });
    expect(Number.isFinite(settings.fontSize)).toBe(true);
  });
});

describe("applySettings", () => {
  it("主题写到 data-theme，尺寸写到 CSS 变量", () => {
    const root = document.createElement("div");
    applySettings({ ...DEFAULT_SETTINGS, theme: "dark", fontSize: 20, measure: 50 }, root);
    expect(root.dataset.theme).toBe("dark");
    expect(root.style.getPropertyValue("--wr-font-size")).toBe("20px");
    expect(root.style.getPropertyValue("--wr-measure")).toBe("50rem");
  });
});

describe("custom css", () => {
  it("去掉 @import 与闭合标签", () => {
    expect(sanitizeCustomCss("@import url(a.css); .a{}")).toBe(" .a{}");
    expect(sanitizeCustomCss(".a{content:'</style>'}")).not.toContain("</style");
  });

  it("注入与移除 style 标签", () => {
    applyCustomCss(".wr-doc { color: red }");
    expect(document.getElementById("wr-custom-css")?.textContent).toContain("color: red");
    applyCustomCss("");
    expect(document.getElementById("wr-custom-css")).toBeNull();
  });

  it("设置里保留自定义 CSS，自动保存默认打开", () => {
    const settings = normalizeSettings({ customCss: ".a{}" });
    expect(settings.customCss).toBe(".a{}");
    expect(settings.autoSaveFile).toBe(true);
    expect(normalizeSettings({ autoSaveFile: false }).autoSaveFile).toBe(false);
  });
});

describe("load / save", () => {
  it("读写一致，坏数据不炸", () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: "light", fontSize: 18, measure: 44, autosaveDelay: 600, paper: "letter", margin: "narrow" });
    expect(loadSettings()).toMatchObject({ theme: "light", fontSize: 18, measure: 44, paper: "letter", margin: "narrow" });

    localStorage.setItem("writara:settings", "{not json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});

describe("AI 设置", () => {
  it("保留选中的 agent 与每个 agent 的模型", () => {
    const settings = normalizeSettings({
      aiAgentId: "cli:opencode",
      aiAgentModels: { opencode: "m", claude: "" },
    });
    expect(settings.aiAgentId).toBe("cli:opencode");
    expect(settings.aiAgentModels).toEqual({ opencode: "m" });
    expect(settings.aiApi.baseUrl).toBe("");
    expect(settings.aiProviders).toEqual([]);
  });

  it("旧端点字段不再影响配置", () => {
    const settings = normalizeSettings({
      aiEndpoint: "https://old.example/v1",
      aiApi: { protocol: "openai", baseUrl: "https://x.example/v1", apiKey: "k", headers: "" },
    });
    expect(settings.aiApi.baseUrl).toBe("");
    expect(settings.aiEndpoint).toBe("");
  });
});
