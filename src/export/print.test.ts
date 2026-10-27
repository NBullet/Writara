// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { installPrintStyles, markSplittable, standaloneHtml, updatePrintView } from "./print";

describe("standaloneHtml", () => {
  it("样式完整内联，不依赖站点 CSS", () => {
    const html = standaloneHtml("# 标题\n\n正文 **粗**", "标题");
    expect(html).toContain("@page");
    expect(html).toContain(".wr-doc .wr-task");
    expect(html).toContain(".wr-page-break");
    expect(html).toContain('<article class="wr-doc">');
    expect(html).toContain("<strong>粗</strong>");
    expect(html).not.toContain("?raw");
  });

  it("标题里的特殊字符被转义", () => {
    const html = standaloneHtml("正文", "<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("</title>");
  });

  it("导出时内联当前主题变量", () => {
    document.documentElement.style.setProperty("--wr-bg", "#123456");
    document.documentElement.style.setProperty("--wr-text", "#abcdef");
    try {
      const html = standaloneHtml("# 标题", "标题");
      expect(html).toContain("--wr-bg: #123456;");
      expect(html).toContain("--wr-text: #abcdef;");
    } finally {
      document.documentElement.style.removeProperty("--wr-bg");
      document.documentElement.style.removeProperty("--wr-text");
    }
  });

  it("打印样式使用主题变量而不是写死颜色", () => {
    const html = standaloneHtml("正文", "标题");
    expect(html).toContain("var(--wr-text");
    expect(html).toContain("var(--wr-border");
  });
});

describe("print host", () => {
  it("重复渲染只保留一个宿主，并注入一次样式", () => {
    updatePrintView("# 标题");
    updatePrintView("# 标题\n\n正文");
    installPrintStyles();
    expect(document.querySelectorAll("#wr-print-host")).toHaveLength(1);
    expect(document.querySelectorAll("#wr-print-styles")).toHaveLength(1);
    expect(document.getElementById("wr-print-host")?.innerHTML).toContain('<h1 id="标题">');
  });

  it("只有超过一页高的块才允许拆分", () => {
    updatePrintView("```ts\nconst a = 1;\n```\n\n| a |\n|--|\n| 1 |");
    const host = document.getElementById("wr-print-host") as HTMLElement;
    const pre = host.querySelector("pre") as HTMLElement;
    const table = host.querySelector("table") as HTMLElement;

    Object.defineProperty(pre, "getBoundingClientRect", { value: () => ({ height: 2000 }) });
    Object.defineProperty(table, "getBoundingClientRect", { value: () => ({ height: 120 }) });

    markSplittable(host, 1000);
    expect(pre.classList.contains("wr-split")).toBe(true);
    expect(table.classList.contains("wr-split")).toBe(false);
  });
});
