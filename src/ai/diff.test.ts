import { describe, expect, it } from "vitest";

import { diffLines } from "./diff";

describe("行级 diff", () => {
  it("纯插入", () => {
    expect(diffLines("a\nb", "a\nc\nb").map((line) => `${line.type}:${line.text}`)).toEqual([
      "same:a",
      "ins:c",
      "same:b",
    ]);
  });

  it("纯删除", () => {
    const lines = diffLines("a\nb\nc", "a\nc");
    expect(lines.filter((line) => line.type === "del").map((line) => line.text)).toEqual(["b"]);
  });

  it("同段替换被对齐成短的 del/ins", () => {
    const lines = diffLines("第一段\n第二段\n第三段", "第一段\n二段（改）\n第三段");
    expect(lines.filter((line) => line.type === "del")).toHaveLength(1);
    expect(lines.filter((line) => line.type === "ins")).toHaveLength(1);
    expect(lines.at(-1)!.text).toBe("第三段");
  });

  it("完全一致只出 same", () => {
    expect(diffLines("a\nb", "a\nb").every((line) => line.type === "same")).toBe(true);
  });

  it("超长输入放弃逐行对齐，整块替换", () => {
    const before = Array.from({ length: 900 }, (_, i) => `旧${i}`).join("\n");
    const after = Array.from({ length: 900 }, (_, i) => `新${i}`).join("\n");
    const lines = diffLines(before, after);
    expect(lines.some((line) => line.type === "del")).toBe(true);
    expect(lines.some((line) => line.type === "ins")).toBe(true);
  });

  it("公共前后缀被保留", () => {
    const lines = diffLines("头\nx\n尾", "头\ny\n尾");
    expect(lines[0]).toEqual({ type: "same", text: "头" });
    expect(lines.at(-1)).toEqual({ type: "same", text: "尾" });
  });
});
