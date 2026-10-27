import { describe, expect, it } from "vitest";

import { runChecks } from "./checks";

const rules = (text: string, options?: Parameters<typeof runChecks>[1]): string[] =>
  runChecks(text, options).map((issue) => issue.rule);

describe("文档体检", () => {
  it("干净文档不报问题", () => {
    const clean = "# 标题\n\n正文一句话。\n\n## 小节\n\n另一句话。\n";
    expect(runChecks(clean)).toEqual([]);
  });

  it("标题层级跳跃", () => {
    const issues = runChecks("# 一级\n\n内容。\n\n### 三级\n\n内容。\n");
    const jump = issues.find((issue) => issue.rule === "heading-jump");
    expect(jump?.message).toContain("h1");
    expect(jump?.line).toBe(5);
  });

  it("空章节", () => {
    const issues = runChecks("## 空的\n\n## 有内容\n\n正文。\n");
    expect(issues.filter((issue) => issue.rule === "empty-section")).toHaveLength(1);
  });

  it("同名标题会冲突", () => {
    const issues = runChecks("# 小结\n\na\n\n# 小结\n\nb\n");
    expect(issues.some((issue) => issue.rule === "heading-duplicate")).toBe(true);
  });

  it("中文里的半角标点：逐条报并可修复", () => {
    const issues = runChecks("这是一句话,还有一句.\n");
    const punct = issues.filter((issue) => issue.rule === "halfwidth-punct");
    expect(punct).toHaveLength(2);
    expect(punct[0]!.fix?.insert).toBe("，");
    expect(punct[1]!.fix?.insert).toBe("。");
  });

  it("围栏与行内代码里的标点不动", () => {
    const text = "```\nconst a = 1, b = 2;\n```\n\n`a, b` 是代码。\n";
    expect(rules(text).filter((rule) => rule === "halfwidth-punct")).toHaveLength(0);
  });

  it("HTML / SVG 块不当正文检查", () => {
    const rects = Array.from(
      { length: 40 },
      (_, i) => `  <rect x="${i}" y="0" width="4" height="4" />`,
    ).join("\n");
    const text = `# 图形 SVG\n\n<svg viewBox="0 0 40 4">\n${rects}\n</svg>\n`;
    const found = rules(text);
    expect(found).not.toContain("long-paragraph");
    expect(found).not.toContain("long-sentence");
    expect(found).not.toContain("ascii-case");
  });

  it("<details> 跨空行也整块跳过", () => {
    const text = "<details>\n<summary>展开</summary>\n\n这里有半角,逗号。\n\n</details>\n";
    expect(rules(text)).not.toContain("halfwidth-punct");
  });

  it("跳过 HTML 之后，普通正文仍然照常检查", () => {
    const text = `# 图形 SVG\n\n${"这".repeat(320)}。\n\n<svg>\n  <rect />\n</svg>\n`;
    const found = rules(text);
    expect(found).toContain("long-paragraph");
    expect(found).toContain("long-sentence");
  });

  it("断链：目标不在工作区", () => {
    const text = "见 [附录](appendix.md)。\n";
    expect(rules(text, { files: ["其他.md"], docPath: "主文.md" })).toContain("broken-link");
    expect(rules(text, { files: ["appendix.md"], docPath: "主文.md" })).not.toContain("broken-link");
  });

  it("锚点：本文件与跨文件", () => {
    const text = "# 目标\n\n[跳转](#没有这个)\n";
    expect(rules(text)).toContain("broken-anchor");
    const ok = "# 目标\n\n[跳转](#目标)\n";
    expect(rules(ok)).not.toContain("broken-anchor");
  });

  it("表格列数与表头不一致", () => {
    const text = "| a | b | c |\n| --- | --- | --- |\n| 1 | 2 |\n";
    expect(rules(text)).toContain("table-columns");
  });

  it("围栏未闭合", () => {
    expect(rules("```\nconst a = 1;\n")).toContain("fence-unclosed");
  });

  it("块级公式不配对", () => {
    expect(rules("$$\na = b\n")).toContain("math-unclosed");
  });

  it("重复句", () => {
    const sentence = "这是一句需要被检查的重复句子。";
    expect(rules(`${sentence}\n\n${sentence}\n`)).toContain("duplicate-sentence");
  });

  it("AI 腔计入体检", () => {
    expect(rules("总之，先看结论。\n")).toContain("ai-slop");
  });

  it("小说档：章节字数差距", () => {
    const text = [
      "# 第一章",
      "",
      "短。",
      "",
      "# 第二章",
      "",
      "长".repeat(120),
      "",
      "# 第三章",
      "",
      "中".repeat(30),
      "",
    ].join("\n");
    expect(rules(text, { profile: "novel" })).toContain("chapter-length");
    expect(rules(text, { profile: "general" })).not.toContain("chapter-length");
  });

  it("front matter 不参与标点与断链检查", () => {
    const text = "---\ntitle: a,b\nlink: (x.md)\n---\n\n正文。\n";
    expect(rules(text)).toEqual([]);
  });

  it("表格与列表不会被当成一个长句", () => {
    const text = [
      "| 列一 | 列二 |",
      "| --- | --- |",
      "| 值一 | 值二 |",
      "",
      "- 列表项一",
      "- 列表项二",
      "",
    ].join("\n");
    expect(rules(text)).toEqual([]);
  });

  it("正文里的超长句子照常提示", () => {
    const text = `这是一句${"很".repeat(140)}长的话。\n`;
    expect(rules(text)).toContain("long-sentence");
  });
});
