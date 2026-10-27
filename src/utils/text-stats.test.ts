import { describe, expect, it } from "vitest";

import { countChars, countWords, readingMinutes } from "./text-stats";

describe("countWords", () => {
  it("中文逐字计数", () => {
    expect(countWords("自然书写")).toBe(4);
  });

  it("英文按词计数", () => {
    expect(countWords("Write naturally, render instantly.")).toBe(4);
  });

  it("中英混排不重复计数", () => {
    expect(countWords("用 Markdown 写作")).toBe(4);
  });

  it("忽略 Markdown 标记符号", () => {
    expect(countWords("**粗体**")).toBe(2);
  });
});

describe("countChars", () => {
  it("按 Unicode 码点计数，emoji 算一个", () => {
    expect(countChars("文叙🎉")).toBe(3);
  });
});

describe("readingMinutes", () => {
  it("不足一分钟也返回 1", () => {
    expect(readingMinutes(0)).toBe(1);
    expect(readingMinutes(401)).toBe(2);
  });
});
