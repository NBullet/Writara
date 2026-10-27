import { describe, expect, it } from "vitest";

import { briefToPrompt, normalizeBrief, toneForProfile, EMPTY_BRIEF } from "./brief";

describe("写作任务单", () => {
  it("归一化：未知字段回退，超长截断", () => {
    const brief = normalizeBrief({
      profile: "novel",
      tone: "narrative",
      topic: "字".repeat(600),
      audience: 42,
    });
    expect(brief.profile).toBe("novel");
    expect(brief.tone).toBe("narrative");
    expect(brief.topic).toHaveLength(500);
    expect(brief.audience).toBe("");
  });

  it("非法枚举值回退到默认", () => {
    const brief = normalizeBrief({ profile: "poem", tone: "shout" });
    expect(brief.profile).toBe(EMPTY_BRIEF.profile);
    expect(brief.tone).toBe(EMPTY_BRIEF.tone);
  });

  it("档位决定默认语气，但只用于切换时", () => {
    expect(toneForProfile("novel")).toBe("narrative");
    expect(toneForProfile("proposal")).toBe("formal");
    expect(toneForProfile("general")).toBe("plain");
  });

  it("空字段不进提示词", () => {
    const prompt = briefToPrompt(EMPTY_BRIEF);
    expect(prompt).toContain("文体与语气");
    expect(prompt).not.toContain("主题：");
    expect(prompt).not.toContain("必须覆盖");
  });

  it("任务单完整转述", () => {
    const prompt = briefToPrompt({
      ...EMPTY_BRIEF,
      topic: "单元测试",
      audience: "新同事",
      length: "3000 字",
      mustInclude: "为什么写\n怎么写",
      avoid: "不要 emoji",
    });
    expect(prompt).toContain("主题：单元测试");
    expect(prompt).toContain("目标读者：新同事");
    expect(prompt).toContain("篇幅：3000 字");
    expect(prompt).toContain("必须覆盖：\n为什么写\n怎么写");
    expect(prompt).toContain("明确避免：\n不要 emoji");
  });

  it("结构偏好按档位切换", () => {
    expect(briefToPrompt({ ...EMPTY_BRIEF, profile: "proposal" })).toContain("现状");
    expect(briefToPrompt({ ...EMPTY_BRIEF, profile: "novel" })).toContain("场景");
  });
});
