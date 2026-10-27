import { describe, expect, it } from "vitest";

import { mergeFolders, type RecentFolder } from "./store";

function entry(name: string, at: number): RecentFolder {
  return { name, at, root: { name, native: name } };
}

describe("mergeFolders", () => {
  it("新文件夹排在最前，同名去重", () => {
    const current = [entry("notes", 1), entry("docs", 2)];
    const next = mergeFolders(current, entry("docs", 3));
    expect(next.map((item) => item.name)).toEqual(["docs", "notes"]);
    expect(next[0]?.at).toBe(3);
  });

  it("超过上限时丢弃最旧的", () => {
    const current = Array.from({ length: 8 }, (_, index) => entry(`f${index}`, index));
    const next = mergeFolders(current, entry("new", 100), 8);
    expect(next).toHaveLength(8);
    expect(next[0]?.name).toBe("new");
    expect(next.some((item) => item.name === "f7")).toBe(false);
  });
});
