// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { searchFiles } from "../components/SearchDialog";
import type { WorkspaceFile } from "../platform/types";

function file(name: string): WorkspaceFile {
  return { name, path: name, ref: { name, native: name } };
}

const read = async (target: WorkspaceFile): Promise<string> => {
  if (target.name === "a.md") return "第一行\n含有关键字 keyword\n第三行";
  if (target.name === "b.md") return "KEYWORD 大写也要命中\nkeyword 第二次";
  if (target.name === "c.md") return "无关内容";
  throw new Error("读不到");
};

describe("searchFiles", () => {
  it("跨文件、忽略大小写、给出行号", async () => {
    const results = await searchFiles([file("a.md"), file("b.md"), file("c.md")], "keyword", read);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ line: 2 });
    expect(results[0]?.preview).toContain("keyword");
    expect(results[1]?.file.path).toBe("b.md");
    expect(results.map((result) => result.line)).toEqual([2, 1, 2]);
  });

  it("没有关键词返回空", async () => {
    expect(await searchFiles([file("a.md")], "  ", read)).toEqual([]);
  });

  it("单个文件读失败不影响其余文件", async () => {
    const results = await searchFiles([file("bad.md"), file("a.md")], "关键字", read);
    expect(results).toHaveLength(1);
    expect(results[0]?.file.path).toBe("a.md");
  });

  it("返回的 offset 能定位到原文", async () => {
    const text = "第一行\n含有关键字 keyword\n第三行";
    const results = await searchFiles([file("a.md")], "keyword", read);
    expect(text.slice(results[0]!.offset, results[0]!.offset + 7)).toBe("keyword");
  });
});
