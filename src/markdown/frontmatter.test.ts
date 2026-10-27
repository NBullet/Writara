import { describe, expect, it } from "vitest";

import { parseFrontMatter } from "./frontmatter";

describe("parseFrontMatter", () => {
  it("识别标题与正文范围", () => {
    const source = "---\ntitle: 我的文档\ntags: [a, b]\n---\n\n正文";
    const front = parseFrontMatter(source);
    expect(front?.title).toBe("我的文档");
    expect(front?.body).toBe("\n正文");
    expect(front?.to).toBe(source.indexOf("\n\n正文") + 1);
  });

  it("没有 front matter 时返回 null", () => {
    expect(parseFrontMatter("# 标题\n\n正文")).toBeNull();
    expect(parseFrontMatter("---\n正文")).toBeNull();
  });

  it("带引号的标题去掉引号", () => {
    expect(parseFrontMatter('---\ntitle: "Quoted"\n---\n正文')?.title).toBe("Quoted");
  });
});
