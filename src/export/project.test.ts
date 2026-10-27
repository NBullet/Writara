// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { bundleIndexHtml, chapterFileName, renderProject } from "./project";

describe("chapterFileName", () => {
  it("按序号前缀并清掉非法字符", () => {
    expect(chapterFileName(0, "第一章：起")).toBe("01-第一章：起.html");
    expect(chapterFileName(9, 'a/b:c*?"<>|')).toBe("10-a_b_c_.html");
    expect(chapterFileName(2, "   ")).toBe("03-章节.html");
  });
});

describe("renderProject", () => {
  it("合并多章、生成目录，并给跨章重复标题加后缀", async () => {
    const result = await renderProject(
      [
        { path: "卷一/01.md", title: "起", text: "# 起\n\n甲" },
        { path: "卷一/02.md", title: "承", text: "# 起\n\n乙" },
      ],
      { title: "长夜", toc: true, chapterBreak: true },
      () => undefined,
    );

    expect(result.chapters).toHaveLength(2);
    expect(result.html).toContain('id="起"');
    expect(result.html).toContain('id="起-2"');
    expect(result.html).toContain('href="#起-2"');
    expect(result.html).toContain('class="wr-project-chapter"');
    expect(result.html).toContain("长夜");
  });

  it("不生成目录时仍保留章节锚点", async () => {
    const result = await renderProject(
      [{ path: "a.md", title: "甲", text: "没有标题的正文" }],
      { title: "册", toc: false, chapterBreak: false },
      () => undefined,
    );

    expect(result.html).not.toContain('class="wr-doc wr-project-toc"');
    expect(result.html).toContain('id="chapter-1"');
    expect(result.html).toContain("没有标题的正文");
  });

  it("图片按每章所在目录解析，不共用项目根", async () => {
    const calls: string[] = [];
    const result = await renderProject(
      [
        { path: "卷一/01.md", title: "起", text: "![图](img.png)" },
        { path: "卷二/02.md", title: "承", text: "![图](img.png)" },
      ],
      { title: "册", toc: false, chapterBreak: true },
      (chapterPath) => async (src) => {
        calls.push(`${chapterPath}:${src}`);
        return `data:image/png;base64,${chapterPath}`;
      },
    );

    expect(calls).toEqual(["卷一/01.md:img.png", "卷二/02.md:img.png"]);
    expect(result.html).toContain("data:image/png;base64,卷一/01.md");
    expect(result.html).toContain("data:image/png;base64,卷二/02.md");
  });
});

describe("bundleIndexHtml", () => {
  it("索引页链接到每个章节文件", () => {
    const html = bundleIndexHtml("长夜", [
      { title: "起", fileName: "01-起.html" },
      { title: "承", fileName: "02-承.html" },
    ]);

    expect(html).toContain('href="01-起.html"');
    expect(html).toContain('href="02-承.html"');
    expect(html).toContain("长夜");
  });
});
