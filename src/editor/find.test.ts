import { describe, expect, it } from "vitest";

import { findMatches, matchIndexAt, replacementFor } from "./find";

describe("findMatches", () => {
  it("普通查找忽略大小写并按位置排序", () => {
    const text = "Foo bar foo BAR";
    expect(findMatches(text, "foo", { caseSensitive: false })).toEqual([
      { from: 0, to: 3 },
      { from: 8, to: 11 },
    ]);
    expect(findMatches(text, "foo", { caseSensitive: true })).toEqual([{ from: 8, to: 11 }]);
  });

  it("只在选区内匹配", () => {
    const text = "foo bar foo";
    expect(findMatches(text, "foo", { scope: { from: 4, to: 11 } })).toEqual([{ from: 8, to: 11 }]);
    expect(findMatches(text, "foo", { scope: { from: 4, to: 7 } })).toEqual([]);
  });

  it("支持正则与零宽匹配", () => {
    expect(findMatches("a1 b22 c333", "\\d+", { regex: true }).map((m) => m.from)).toEqual([1, 4, 8]);
    expect(findMatches("abc", "^", { regex: true })).toEqual([]);
    expect(findMatches("abc", "(", { regex: true })).toEqual([]);
  });

  it("全词匹配跳过单词内部", () => {
    expect(findMatches("cat scatter cat", "cat", { wholeWord: true })).toEqual([
      { from: 0, to: 3 },
      { from: 12, to: 15 },
    ]);
    expect(findMatches("Cat cat", "Cat", { wholeWord: true, caseSensitive: true })).toEqual([
      { from: 0, to: 3 },
    ]);
    expect(findMatches("cat2 cat", "cat", { wholeWord: true })).toEqual([{ from: 5, to: 8 }]);
  });

  it("全词 + 正则也生效", () => {
    expect(findMatches("a1 ga1 a1", "a\\d", { regex: true, wholeWord: true })).toEqual([
      { from: 0, to: 2 },
      { from: 7, to: 9 },
    ]);
  });

  it("空查找词不返回匹配", () => {
    expect(findMatches("abc", "")).toEqual([]);
  });
});

describe("replacementFor", () => {
  it("普通模式直接用替换文本", () => {
    expect(replacementFor("a1", { from: 0, to: 2 }, "a1", {}, "x")).toBe("x");
  });

  it("正则模式保留分组引用", () => {
    expect(
      replacementFor("2026-10-22", { from: 0, to: 10 }, "(\\d+)-(\\d+)-(\\d+)", { regex: true }, "$3/$2/$1"),
    ).toBe("22/10/2026");
  });
});

describe("matchIndexAt", () => {
  const matches = [
    { from: 0, to: 2 },
    { from: 5, to: 7 },
  ];

  it("返回光标后的第一个匹配", () => {
    expect(matchIndexAt(matches, 1)).toBe(0);
    expect(matchIndexAt(matches, 3)).toBe(1);
  });

  it("越界时回到开头", () => {
    expect(matchIndexAt(matches, 99)).toBe(0);
    expect(matchIndexAt([], 0)).toBe(-1);
  });
});
