import { describe, expect, it } from "vitest";

import { EDITOR_STYLE_SPEC } from "../editor/theme";
import { PRINT_CSS } from "../export/printStyles";
import { BULLETS } from "../editor/live-preview/bullet-widget";

/**
 * 编辑器与打印/导出的样式一致性护栏。
 *
 * 这类差异反复出现过（圆点大小、复选框字体、高亮底色、链接下划线、字号缩放……），
 * 每次都是同一类问题：两边各写一套值。这里把「两边必须相等」的几项钉死，
 * 任何一边改了而另一边没跟上，测试就会红。
 *
 * 比较前会去掉 var() 的回退值：`var(--wr-link)` 与 `var(--wr-link, #2f6f8f)` 视为同一个值。
 */

function normalize(value: string | undefined): string {
  if (!value) return "";
  return value
    .replace(/var\((--[\w-]+)\s*,[^)]*\)/g, "var($1)")
    .replace(/\s+/g, " ")
    .replace(/["']/g, "")
    .trim()
    .toLowerCase();
}

/** 从 PRINT_CSS 里取出某条规则：把所有匹配的规则按顺序合并（相当于层叠）。 */
function printRule(selector: string): Record<string, string> {
  const css = PRINT_CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const target = selector.trim().toLowerCase();
  const out: Record<string, string> = {};
  let found = false;
  for (const chunk of css.split("}")) {
    const brace = chunk.indexOf("{");
    if (brace < 0) continue;
    const selectors = chunk
      .slice(0, brace)
      .split(",")
      .map((entry) => entry.trim().toLowerCase());
    if (!selectors.includes(target)) continue;
    found = true;
    for (const line of chunk.slice(brace + 1).split(";")) {
      const colon = line.indexOf(":");
      if (colon < 0) continue;
      out[line.slice(0, colon).trim()] = line.slice(colon + 1).trim();
    }
  }
  if (!found) throw new Error(`打印样式里没有 ${selector}`);
  return out;
}

/** 编辑器主题里某个选择器的声明（键名转成 CSS 的连字符形式）。 */
function editorRule(selector: string): Record<string, string> {
  const spec = (EDITOR_STYLE_SPEC as Record<string, Record<string, unknown>>)[selector];
  if (!spec) throw new Error(`编辑器主题里没有 ${selector}`);
  const out: Record<string, string> = {};
  for (const [name, value] of Object.entries(spec)) {
    const cssName = name.replace(/[A-Z]/g, (char) => `-${char.toLowerCase()}`);
    out[cssName] = String(value);
  }
  return out;
}

describe("编辑器与打印样式一致", () => {
  it("正文行高相同", () => {
    expect(normalize(editorRule(".cm-scroller")["line-height"])).toBe(
      normalize(printRule(".wr-doc")["line-height"]),
    );
  });

  it("标题阶梯相同", () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(normalize(editorRule(`.cm-md-heading-${level}`)["font-size"])).toBe(
        normalize(printRule(`.wr-doc h${level}`)["font-size"]),
      );
    }
  });

  it("正文字体与标题字体分工一致", () => {
    expect(normalize(editorRule(".cm-scroller")["font-family"])).toBe("var(--wr-font-prose)");
    expect(normalize(printRule(".wr-doc")["font-family"])).toContain("var(--wr-font-prose");
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(normalize(editorRule(`.cm-md-heading-${level}`)["font-family"])).toBe(
        normalize(printRule(`.wr-doc h${level}`)["font-family"]),
      );
    }
  });

  it("标题与下段的间隔相同", () => {
    // 编辑器直接给 padding-bottom；打印经 --head-gap 转一手，但两者必须指向同一个变量
    expect(normalize(editorRule(".cm-md-heading-2")["padding-bottom"])).toBe(
      "var(--wr-heading-bottom)",
    );
    expect(normalize(printRule(".wr-doc h2")["margin"])).toContain("var(--head-gap)");
    expect(PRINT_CSS).toContain("--head-gap: var(--wr-heading-bottom");
  });

  it("高亮只有底色，底色与内边距一致", () => {
    const editor = editorRule(".cm-md-mark");
    const print = printRule(".wr-doc mark");
    expect(normalize(editor["background-color"])).toBe(normalize(print["background"]));
    expect(normalize(editor["padding"])).toBe(normalize(print["padding"]));
    expect(normalize(editor["font-style"])).toBe("normal");
    expect(normalize(print["font-style"])).toBe("normal");
  });

  it("链接颜色与下划线一致", () => {
    const editor = editorRule(".cm-md-link");
    const print = printRule(".wr-doc a");
    expect(normalize(editor["color"])).toBe(normalize(print["color"]));
    expect(normalize(editor["text-decoration"])).toBe("underline");
    expect(normalize(print["text-decoration"])).toBe("underline");
  });

  it("行内代码的字号、内边距、圆角一致", () => {
    const editor = editorRule(".cm-md-code");
    const print = printRule(".wr-doc code");
    expect(normalize(editor["font-size"])).toBe(normalize(print["font-size"]));
    expect(normalize(editor["padding"])).toBe(normalize(print["padding"]));
    expect(normalize(editor["border-radius"])).toBe(normalize(print["border-radius"]));
  });

  it("代码块的行盒与正文等高", () => {
    const editor = editorRule(".cm-md-codeblock");
    expect(normalize(editor["line-height"])).toContain("var(--wr-lh)");
    expect(normalize(printRule(".wr-doc pre")["line-height"])).toContain("var(--wr-code-scale)");
  });

  it("任务列表的方框用同一套字体", () => {
    expect(normalize(editorRule(".cm-md-task")["font-family"])).toBe(
      normalize(printRule(".wr-doc .wr-task-box")["font-family"]),
    );
  });

  it("无序列表的符号与打印样式的 content 完全相同", () => {
    expect(PRINT_CSS).toContain(`content: "${BULLETS[0]}"`);
    expect(PRINT_CSS).toContain(`content: "${BULLETS[1]}"`);
    expect(PRINT_CSS).toContain(`content: "${BULLETS[2]}"`);
  });

  it("上下标的字号一致", () => {
    expect(normalize(editorRule(".cm-md-sup")["font-size"])).toBe(
      normalize(printRule(".wr-doc sup")["font-size"]),
    );
    expect(normalize(editorRule(".cm-md-sub")["font-size"])).toBe(
      normalize(printRule(".wr-doc sub")["font-size"]),
    );
  });

  it("定义列表的术语字重与解释缩进一致", () => {
    expect(normalize(editorRule(".cm-md-def-term")["font-weight"])).toBe(
      normalize(printRule(".wr-doc dl.wr-dl dt")["font-weight"]),
    );
    expect(normalize(editorRule(".cm-md-def-detail")["padding-left"])).toBe(
      normalize(printRule(".wr-doc dl.wr-dl dd")["margin-left"]),
    );
  });

  it("拖过列宽的表格在两边都是固定布局", () => {
    expect(normalize(editorRule(".cm-md-table table.wr-fixed")["table-layout"])).toBe(
      normalize(printRule(".wr-doc table.wr-fixed")["table-layout"]),
    );
  });
});
