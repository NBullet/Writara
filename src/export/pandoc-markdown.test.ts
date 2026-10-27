import { describe, expect, it } from "vitest";

import { rewriteMarkdown } from "./pandoc-markdown";

const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

describe("给 Pandoc 的 Markdown 改写", () => {
  it("把 [TOC] 变成 --toc，并从正文里去掉", () => {
    const { markdown, toc } = rewriteMarkdown("# 标题\n\n[TOC]\n\n正文");
    expect(toc).toBe(true);
    expect(markdown).not.toContain("[TOC]");
    expect(markdown).toContain("# 标题");
  });

  it("代码块里的 [TOC] 与图片写法保持原样", () => {
    const source = ["```md", "[TOC]", "![x](a.png =10x10)", "```", "", "[TOC]"].join("\n");
    const { markdown, toc } = rewriteMarkdown(source);
    expect(toc).toBe(true);
    expect(markdown).toContain("```md\n[TOC]\n![x](a.png =10x10)\n```");
  });

  it("把 pagebreak 注释换成原生分页", () => {
    const { markdown } = rewriteMarkdown("上\n\n<!-- pagebreak -->\n\n下");
    expect(markdown).toContain('```{=openxml}\n<w:p><w:r><w:br w:type="page"/></w:r></w:p>\n```');
  });

  it("=宽x高 换成 Pandoc 的宽度属性，超过版心按比例缩", () => {
    const { markdown } = rewriteMarkdown(`![图](${png} =1000x500)`, { maxWidth: 520 });
    expect(markdown).toContain(`![图](${png}){width=520px height=260px}`);
  });

  it("只给过宽的原图补宽度，小图不加属性", () => {
    const widths = new Map([
      ["big.png", 1200],
      ["small.png", 320],
    ]);
    const { markdown } = rewriteMarkdown("![a](big.png)\n![b](small.png)", { widths, maxWidth: 520 });
    expect(markdown).toContain("![a](big.png){width=520px}");
    expect(markdown).toContain("![b](small.png)");
  });

  it("行内 <img> 转成 Markdown 图片，百分比按版心换算", () => {
    const { markdown } = rewriteMarkdown('<img src="a.png" alt="图A" width="50%">', { maxWidth: 520 });
    expect(markdown).toContain("![图A](a.png){width=260px}");
  });

  it("文件名式 alt 不带进图注", () => {
    const { markdown } = rewriteMarkdown(`![截图 2024-01-01.png](${png} =300)`);
    expect(markdown).toContain(`![](${png}){width=300px}`);
  });

  it("<br> 变成硬换行，行内代码里的不动", () => {
    const { markdown } = rewriteMarkdown("第一行<br>第二行\n`<br>`");
    expect(markdown).toContain("第一行\\\n第二行");
    expect(markdown).toContain("`<br>`");
  });

  it("尺寸写法在行内代码里不生效", () => {
    const { markdown } = rewriteMarkdown("`![a](b.png =10x10)`");
    expect(markdown).toBe("`![a](b.png =10x10)`");
  });
});
