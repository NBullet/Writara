import { describe, expect, it } from "vitest";

import { mergeRecent, type RecentFile } from "./recent";

function entry(name: string, at: number): RecentFile {
  return { name, at, ref: { name, native: name } };
}

describe("mergeRecent", () => {
  it("新文件排在最前，同名去重", () => {
    const current = [entry("a.md", 1), entry("b.md", 2)];
    const next = mergeRecent(current, entry("b.md", 3));
    expect(next.map((item) => item.name)).toEqual(["b.md", "a.md"]);
    expect(next[0]?.at).toBe(3);
  });

  it("超过上限时丢弃最旧的", () => {
    const current = Array.from({ length: 8 }, (_, index) => entry(`f${index}.md`, index));
    const next = mergeRecent(current, entry("new.md", 100), 8);
    expect(next).toHaveLength(8);
    expect(next[0]?.name).toBe("new.md");
    expect(next.some((item) => item.name === "f7.md")).toBe(false);
  });
});
