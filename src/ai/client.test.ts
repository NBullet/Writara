import { describe, expect, it } from "vitest";

import { aiConfigOf, completionsUrl, parseCustomHeaders } from "./client";
import { DEFAULT_SETTINGS } from "../storage/settings";

describe("请求头解析", () => {
  it("逐行解析 Name: Value", () => {
    expect(parseCustomHeaders("x-tenant-id: 42\nx-api-key: sk-abc")).toEqual({
      "x-tenant-id": "42",
      "x-api-key": "sk-abc",
    });
  });

  it("忽略空行、注释与没有冒号的行", () => {
    expect(parseCustomHeaders("\n# 注释\n没有冒号\nx-a: 1\n")).toEqual({ "x-a": "1" });
  });

  it("值里可以有冒号（只按第一个冒号切）", () => {
    expect(parseCustomHeaders("x-url: https://gw.internal")).toEqual({
      "x-url": "https://gw.internal",
    });
  });

  it("Content-Type 一律忽略（协议由客户端管理）", () => {
    expect(parseCustomHeaders("Content-Type: text/plain")).toEqual({});
    expect(parseCustomHeaders("content-type: text/plain")).toEqual({});
  });

  it("同名键大小写不敏感，后者覆盖", () => {
    expect(parseCustomHeaders("X-A: 1\nx-a: 2")).toEqual({ "x-a": "2" });
  });

  it("非法键名跳过", () => {
    expect(parseCustomHeaders("坏 名字: 1\nx-ok: 1")).toEqual({ "x-ok": "1" });
  });
});

describe("端点", () => {
  it("base 地址自动补 /chat/completions", () => {
    expect(completionsUrl("https://gw.example/v1")).toBe("https://gw.example/v1/chat/completions");
    expect(completionsUrl("https://gw.example/v1/")).toBe(
      "https://gw.example/v1/chat/completions",
    );
  });

  it("完整地址不再拼接", () => {
    const full = "https://gw.example/v1/chat/completions";
    expect(completionsUrl(full)).toBe(full);
  });
});

describe("配置解析", () => {
  const api = {
    protocol: "openai" as const,
    baseUrl: "https://a.example/v1",
    apiKey: "k",
    headers: "x-tenant-id: 42",
  };

  it("内置 API 的端点与模型齐了才算配置完成", () => {
    expect(aiConfigOf({ ...DEFAULT_SETTINGS, aiApi: { ...api, baseUrl: "" } })).toBeNull();
    expect(
      aiConfigOf({ ...DEFAULT_SETTINGS, aiApi: api, aiAgentModels: {} }),
    ).toBeNull();
  });

  it("带上解析后的自定义请求头", () => {
    const config = aiConfigOf({
      ...DEFAULT_SETTINGS,
      aiApi: api,
      aiAgentModels: { api: "m" },
    });
    expect(config).toMatchObject({ model: "m", apiKey: "k", headers: { "x-tenant-id": "42" } });
  });

  it("Ollama 自动补 /v1", () => {
    const config = aiConfigOf({
      ...DEFAULT_SETTINGS,
      aiApi: { ...api, protocol: "ollama", baseUrl: "http://localhost:11434" },
      aiAgentModels: { api: "m" },
    });
    expect(config?.endpoint).toBe("http://localhost:11434/v1");
  });

  it("模型来自 agent 配置（api 键）", () => {
    const config = aiConfigOf({
      ...DEFAULT_SETTINGS,
      aiApi: api,
      aiAgentModels: { api: "override" },
    });
    expect(config?.model).toBe("override");
  });
});
