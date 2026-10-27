// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { documentTitle, renderMarkdown } from "./render";

const render = (source: string) => renderMarkdown(source);

describe("block 渲染", () => {
  it("标题、段落与行内强调", () => {
    expect(render("# 一级\n\n正文 **粗** 与 *斜* 和 ~~删~~")).toBe(
      '<div class="wr-keep wr-gap">\n<h1 id="一级">一级</h1>\n<p>正文 <strong>粗</strong> 与 <em>斜</em> 和 <del>删</del></p>\n</div>\n',
    );
  });

  it("标题与紧随其后的块绑在一起，避免页尾孤行", () => {
    const html = render('## 图形\n\n<svg viewBox="0 0 10 10">\n<rect width="4"/>\n</svg>\n\n正文');
    expect(html).toContain('<div class="wr-keep wr-gap">\n<h2 id="图形">图形</h2>\n<svg');
  });

  it("标题生成锚点，重复标题自动加序号", () => {
    expect(render("# 同名\n\n## 同名")).toContain('id="同名"');
    expect(render("# 同名\n\n## 同名")).toContain('id="同名-1"');
  });

  it("[TOC] 生成带锚点的目录", () => {
    const html = render("# 一\n\n[TOC]\n\n## 二");
    expect(html).toContain('<nav class="wr-toc">');
    expect(html).toContain('<a href="#一">一</a>');
    expect(html).toContain('<a href="#二">二</a>');
    expect(html).toContain('class="wr-toc-2"');
  });

  it("front matter 不进入输出，标题可来自 front matter", () => {
    const html = render("---\ntitle: 文档标题\n---\n\n正文");
    expect(html).not.toContain("title:");
    expect(html).toContain("<p>正文</p>");
    expect(documentTitle("---\ntitle: 文档标题\n---\n\n正文", "x")).toBe("文档标题");
  });

  it("参考链接去定义表里解析", () => {
    const html = render("[文档][ref] 与 [另一个][REF]\n\n[ref]: https://example.com \"标题\"");
    expect(html).toContain('<a href="https://example.com" title="标题">文档</a>');
    expect(html).toContain('<a href="https://example.com" title="标题">另一个</a>');
    expect(html).not.toContain("[ref]:");
  });

  it("脚注生成上标引用与文末注释", () => {
    const html = render("正文[^1]\n\n[^1]: 注释内容");
    expect(html).toContain('class="wr-fn-ref"');
    expect(html).toContain('href="#fn-1"');
    expect(html).toContain("<section class=\"wr-footnotes\">");
    expect(html).toContain("注释内容");
    expect(html).not.toContain("[^1]:");
  });

  it("脚注支持缩进续行，正文里不重复渲染", () => {
    const html = render("正文[^long]\n\n[^long]: 第一行\n    第二行\n\n    第二段\n\n后记");
    expect(html).toContain("第一行");
    expect(html).toContain("第二行");
    expect(html).toContain("第二段");
    expect(html.match(/第一行/g)).toHaveLength(1);
    expect(html).toContain("<p>后记</p>");
  });

  it("高亮、上下标与 emoji", () => {
    expect(render("==高亮==")).toContain("<mark>高亮</mark>");
    expect(render("H~2~O")).toContain("H<sub>2</sub>O");
    expect(render("x^2^")).toContain("x<sup>2</sup>");
    expect(render("你好 :smile:")).toContain("😄");
    expect(render(":unknown_emoji:")).toContain(":unknown_emoji:");
  });

  it("代码块里的 == 不会被当成高亮", () => {
    const html = render("```\na == b\n```");
    expect(html).toContain("a == b");
    expect(html).not.toContain("<mark>");
  });

  it("行内公式与公式块", () => {
    const inline = render("质能方程 $E=mc^2$ 结束");
    expect(inline).toContain('class="katex"');
    expect(inline).not.toContain("$E=mc^2$");

    const block = render("$$\n\\int_0^1 x^2 dx\n$$");
    expect(block).toContain("wr-math-block");
    expect(block).toContain("katex-display");
  });

  it("代码里的美元符号不会被当成公式", () => {
    const html = render("```sh\necho $HOME\n```");
    expect(html).toContain("$HOME");
    expect(html).not.toContain("katex");
  });

  it("价格写法不误判为公式", () => {
    const html = render("这本书 $5 和 $6");
    expect(html).toContain("$5");
    expect(html).not.toContain("katex");
  });

  it("围栏代码块保留语言并转义", () => {
    expect(render("```ts\nconst a = 1 < 2;\n```")).toBe(
      '<pre data-lang="ts"><code class="language-ts">const a = 1 &lt; 2;</code></pre>\n',
    );
  });

  it("缩进代码块没有语言类", () => {
    expect(render("    plain()")).toBe("<pre><code>plain()</code></pre>\n");
  });

  it("引用块按块级嵌套", () => {
    expect(render("> 引用 **重点**")).toBe(
      "<blockquote>\n<p>引用 <strong>重点</strong></p>\n</blockquote>\n",
    );
  });

  it("紧凑列表不包 <p>，松散列表包 <p>", () => {
    expect(render("- a\n- b")).toBe("<ul>\n<li>a</li>\n<li>b</li>\n</ul>\n");
    expect(render("- a\n\n- b")).toBe('<ul class="wr-loose">\n<li><p>a</p></li>\n<li><p>b</p></li>\n</ul>\n');
  });

  it("有序列表保留起始序号", () => {
    expect(render("3. three")).toBe('<ol start="3">\n<li>three</li>\n</ol>\n');
  });

  it("任务列表渲染成复选框字符", () => {
    const html = render("- [x] 已完成\n- [ ] 未完成");
    expect(html).toContain("☑");
    expect(html).toContain("☐");
    expect(html).toContain('class="wr-task"');
  });

  it("表格带表头与对齐类", () => {
    const html = render("| 左 | 右 |\n|:--|--:|\n| 1 | 2 |");
    expect(html).toContain("<thead>");
    expect(html).toContain('<th class="wr-align-left">左</th>');
    expect(html).toContain('<th class="wr-align-right">右</th>');
    expect(html).toContain('<td class="wr-align-left">1</td>');
  });

  it("分隔线与 HTML 注释分页", () => {
    expect(render("---")).toBe("<hr>\n");
    expect(render("<!-- pagebreak -->")).toBe('<div class="wr-page-break"></div>\n');
  });
});

describe("行内渲染", () => {
  it("链接与标题属性", () => {
    expect(render('[文档](https://example.com "标题")')).toBe(
      '<p><a href="https://example.com" title="标题">文档</a></p>\n',
    );
  });

  it("图片保留 alt 与 title", () => {
    const html = render('![图](pic.svg "说明")');
    expect(html).toContain('<img src="pic.svg"');
    expect(html).toContain('alt="图"');
    expect(html).toContain('title="说明"');
  });

  it("图片尺寸语法 =宽x高", () => {
    const html = render("![图](pic.png =120x80)");
    expect(html).toContain('width="120"');
    expect(html).toContain('height="80"');
    expect(html).not.toContain("=120x80");
  });

  it("行内代码转义 HTML", () => {
    expect(render("`<b>a</b>`")).toBe("<p><code>&lt;b&gt;a&lt;/b&gt;</code></p>\n");
  });

  it("硬换行变成 br，反斜杠转义不再当语法", () => {
    expect(render("a  \nb")).toBe("<p>a<br>\nb</p>\n");
    expect(render("\\*不是斜体\\*")).toBe("<p>*不是斜体*</p>\n");
  });

  it("实体保持原样", () => {
    expect(render("&copy; 2026")).toBe("<p>© 2026</p>\n");
  });
});

describe("HTML / SVG", () => {
  it("独立的 svg 块原样进入输出", () => {
    const html = render('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
    expect(html).toContain("<svg");
    expect(html).toContain("<circle");
  });

  it("svg 里的脚本被清洗掉", () => {
    const html = render('<svg width="10" height="10"><script>alert(1)</script><rect width="4"/></svg>');
    expect(html).not.toContain("alert");
    expect(html).toContain("<rect");
  });

  it("普通 HTML 块保留结构，危险属性被清洗", () => {
    const html = render('<div class="note" onclick="x()">说明</div>');
    expect(html).toContain('class="note"');
    expect(html).not.toContain("onclick");
  });
});

describe("定义列表", () => {
  it("术语 + 解释渲染成 dl / dt / dd", () => {
    expect(render("术语\n: 解释")).toBe(
      '<dl class="wr-dl">\n<dt>术语</dt>\n<dd>解释</dd>\n</dl>\n',
    );
  });

  it("多行解释与行内语法", () => {
    const html = render("**术语**\n: 第一条 **重点**\n: 第二条");
    expect(html).toContain("<dt><strong>术语</strong></dt>");
    expect(html).toContain("<dd>第一条 <strong>重点</strong></dd>");
    expect(html).toContain("<dd>第二条</dd>");
  });

  it("普通两行段落不会被当成定义列表", () => {
    expect(render("第一行\n第二行")).toBe("<p>第一行\n第二行</p>\n");
  });
});

describe("表格列宽", () => {
  it("分隔行横线数不等时输出 colgroup + 固定布局", () => {
    const html = render("| a | b |\n| --- | ------- |\n| 1 | 2 |");
    expect(html).toContain('<table class="wr-fixed">');
    expect(html).toContain('<colgroup><col style="width:30%"><col style="width:70%"></colgroup>');
  });

  it("等宽表格不加 colgroup（浏览器自动布局）", () => {
    expect(render("| a | b |\n| --- | --- |\n| 1 | 2 |")).not.toContain("colgroup");
  });
});

describe("公式自动编号", () => {
  const source = "$$\na^2\n$$\n\n$$\nb^2\n$$";

  /** 每个公式块右侧的编号文字（KaTeX 把 `\tag` 渲染成 .katex-tag）。 */
  function equationTags(html: string): string[] {
    return html
      .split('<div class="wr-math-block">')
      .slice(1)
      .map((block) => {
        const at = block.indexOf('class="katex-tag"');
        if (at < 0) return "";
        const open = block.indexOf(">", at);
        const end = block.indexOf("</div>", open);
        return block.slice(open + 1, end < 0 ? undefined : end).replace(/<[^>]*>/g, "").trim();
      });
  }

  it("开启后按文档顺序编号", () => {
    expect(equationTags(renderMarkdown(source, { mathNumbering: true }))).toEqual(["(1)", "(2)"]);
  });

  it("关闭时不编号", () => {
    expect(equationTags(renderMarkdown(source))).toEqual(["", ""]);
  });

  it("手写 \\tag 的公式保持原样，也不占号", () => {
    const html = renderMarkdown("$$\na\n\\tag{A}\n$$\n\n$$\nb\n$$", { mathNumbering: true });
    expect(equationTags(html)).toEqual(["(A)", "(1)"]);
  });

  it("行内公式不参与编号", () => {
    const html = renderMarkdown("正文 $a+b$ 与\n\n$$\nc\n$$", { mathNumbering: true });
    expect(equationTags(html)).toEqual(["(1)"]);
  });

  it("交叉引用：\\label 与 \\eqref / \\ref（行内公式里解析）", () => {
    const html = renderMarkdown(
      "$$\nx = 1 \\label{eq:x}\n$$\n\n由 $\\eqref{eq:x}$ 与 $\\ref{eq:x}$ 可知，$\\eqref{missing}$ 未知。",
      { mathNumbering: true },
    );
    expect(equationTags(html)).toEqual(["(1)"]);
    // KaTeX 把每个字符拆成 span，去掉标签后逐段检查
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain("由 (1) 与 1 可知");
    expect(text).toContain("(??)");
  });

  it("关闭自动编号时，引用仍能指向手写 \\tag", () => {
    const html = renderMarkdown("$$\nx \\tag{7} \\label{eq:x}\n$$\n\n见 $\\eqref{eq:x}$。");
    expect(html.replace(/<[^>]*>/g, "")).toContain("见 (7)。");
  });
});

describe("documentTitle", () => {
  it("取第一个标题并去掉标记", () => {
    expect(documentTitle("# **文叙** 说明\n\n正文")).toBe("文叙 说明");
    expect(documentTitle("正文\n===")).toBe("正文");
  });

  it("有多个标题时只取文档顺序里的第一个", () => {
    expect(documentTitle("# 第一章\n\n## 第一节\n\n# 第二章")).toBe("第一章");
    expect(documentTitle("前言\n\n## 甲\n\n# 乙")).toBe("甲");
  });

  it("没有标题时用兜底", () => {
    expect(documentTitle("只有正文", "未命名.md")).toBe("未命名.md");
  });
});
