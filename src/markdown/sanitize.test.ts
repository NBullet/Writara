// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { sanitizeHtml, sanitizeSvg } from "./sanitize";

describe("sanitizeHtml", () => {
  it("丢弃脚本与事件属性", () => {
    expect(sanitizeHtml('<script>alert(1)</script><p onclick="steal()">ok</p>')).toBe("<p>ok</p>");
  });

  it("拦截 javascript: 链接，保留 https 链接", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe('<a href="https://example.com">x</a>');
  });

  it("允许 data:image 的图片，拒绝 data:text/html", () => {
    expect(sanitizeHtml('<img src="data:image/svg+xml;base64,AAA">')).toContain("data:image/svg+xml");
    expect(sanitizeHtml('<a href="data:text/html,<script>x</script>">x</a>')).not.toContain("data:text/html");
  });

  it("删除 iframe / form / style 等容器", () => {
    expect(sanitizeHtml('<iframe src="x"></iframe><form><input></form><p>ok</p>')).toBe("<p>ok</p>");
  });

  it("过滤危险的内联样式", () => {
    expect(sanitizeHtml('<span style="position:fixed;top:0">x</span>')).toBe("<span>x</span>");
    expect(sanitizeHtml('<span style="color:red">x</span>')).toBe('<span style="color:red">x</span>');
  });

  it("未知标签只保留内容", () => {
    expect(sanitizeHtml("<custom-tag>文字</custom-tag>")).toBe("文字");
  });

  it("保留排版标签与 class", () => {
    const html = sanitizeHtml('<div class="wr-page-break"></div><mark>高亮</mark>');
    expect(html).toContain('class="wr-page-break"');
    expect(html).toContain("<mark>高亮</mark>");
  });
});

describe("sanitizeSvg", () => {
  it("保留图形与 viewBox", () => {
    const svg = sanitizeSvg('<svg viewbox="0 0 10 10"><circle cx="5" cy="5" r="4"/></svg>');
    expect(svg).toContain("<svg");
    expect(svg).toContain('viewBox="0 0 10 10"');
    expect(svg).toContain("<circle");
  });

  it("去掉 SVG 里的脚本与 foreignObject", () => {
    const svg = sanitizeSvg(
      '<svg><script>alert(1)</script><foreignObject><div>x</div></foreignObject><rect width="4"/></svg>',
    );
    expect(svg).not.toContain("script");
    expect(svg).not.toContain("foreignObject");
    expect(svg).toContain("<rect");
  });

  it("没有 svg 时返回 null", () => {
    expect(sanitizeSvg("<div>不是图形</div>")).toBeNull();
  });
});
