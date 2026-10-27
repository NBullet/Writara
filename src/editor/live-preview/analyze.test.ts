import { markdownLanguage } from "@codemirror/lang-markdown";
import { Text } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { collectEdits, type LiveEdit, type Span } from "./analyze";

function analyze(source: string, cursor: number | null = null): { doc: Text; edits: LiveEdit[] } {
  const doc = Text.of(source.split("\n"));
  const selection: Span[] = cursor === null ? [] : [{ from: cursor, to: cursor }];
  const edits = collectEdits(
    doc,
    markdownLanguage.parser.parse(source),
    selection,
    [{ from: 0, to: doc.length }],
  );
  return { doc, edits };
}

function hiddenText(doc: Text, edits: LiveEdit[]): string[] {
  return edits
    .filter((edit) => edit.kind === "hide")
    .map((edit) => doc.sliceString(edit.from, edit.to));
}

function classes(edits: LiveEdit[]): string[] {
  return edits.flatMap((edit) =>
    edit.kind === "mark" || edit.kind === "line" ? [edit.cls] : [],
  );
}

describe("collectEdits", () => {
  it("光标不在该行时隐藏行内强调标记", () => {
    const { doc, edits } = analyze("正文 **加粗** 结束");
    expect(hiddenText(doc, edits)).toEqual(["**", "**"]);
    expect(classes(edits)).toContain("cm-md-strong");
  });

  it("光标进入该行后露出源码标记", () => {
    const { edits } = analyze("正文 **加粗** 结束", 6);
    expect(edits.filter((edit) => edit.kind === "hide")).toHaveLength(0);
  });

  it("标题按层级加行装饰，并隐藏 # 标记", () => {
    const { doc, edits } = analyze("## 二级标题");
    expect(classes(edits)).toEqual(["cm-md-heading-2"]);
    expect(hiddenText(doc, edits)).toContain("## ");
  });

  it("链接只隐藏标记与地址，保留链接文字", () => {
    const { doc, edits } = analyze("见 [文档](https://example.com) 一节");
    expect(hiddenText(doc, edits)).toEqual(["[", "]", "(", "https://example.com", ")"]);
    expect(classes(edits)).toContain("cm-md-link");
  });

  it("行内代码保留内容、隐藏反引号", () => {
    const { doc, edits } = analyze("运行 `npm test` 即可");
    expect(hiddenText(doc, edits)).toEqual(["`", "`"]);
    expect(classes(edits)).toContain("cm-md-code");
  });

  it("引用块按行加装饰，并隐藏 > 标记", () => {
    const { doc, edits } = analyze("> 第一行\n> 第二行");
    expect(classes(edits).filter((cls) => cls === "cm-md-quote")).toHaveLength(2);
    expect(hiddenText(doc, edits)).toEqual(["> ", "> "]);
  });

  it("分隔线整行隐藏并换成一条线", () => {
    const { doc, edits } = analyze("上文\n\n---\n\n下文");
    expect(classes(edits)).toContain("cm-md-hr");
    expect(hiddenText(doc, edits)).toEqual(["---"]);
  });

  it("围栏代码块逐行加装饰，围栏行带上/下圆角", () => {
    const { doc, edits } = analyze("```ts\nconst a = 1;\n```");
    expect(classes(edits).filter((cls) => cls === "cm-md-codeblock")).toHaveLength(1);
    expect(hiddenText(doc, edits)).toEqual(["```", "ts", "```"]);

    const lineClasses = edits.flatMap((edit) => (edit.kind === "line" ? [edit.cls] : []));
    expect(lineClasses.some((cls) => cls.includes("cm-md-code-fence-open"))).toBe(true);
    expect(lineClasses.some((cls) => cls.includes("cm-md-code-fence-close"))).toBe(true);
  });

  it("图片替换成 widget，只保留 src/alt/title", () => {
    const { edits } = analyze('前文\n\n![图](https://e.com/a.png "标题")');
    const image = edits.find((edit) => edit.kind === "image");
    expect(image).toMatchObject({ src: "https://e.com/a.png", alt: "图", title: "标题" });
  });

  it("图片内部标记不再单独隐藏，避免装饰重叠", () => {
    const { edits } = analyze("![图](https://e.com/a.png)");
    expect(edits.some((edit) => edit.kind === "hide")).toBe(false);
  });

  it("光标在图片行时显示源码", () => {
    const source = "前文\n\n![图](https://e.com/a.png)";
    const { edits } = analyze(source, source.indexOf("!["));
    expect(edits.some((edit) => edit.kind === "image")).toBe(false);
  });

  it("front matter 整块标为元信息，且不产出分隔线", () => {
    const { edits } = analyze("---\ntitle: x\n---\n\n正文");
    expect(classes(edits).filter((cls) => cls === "cm-md-frontmatter")).toHaveLength(3);
    expect(edits.some((edit) => edit.kind === "line" && edit.cls === "cm-md-hr")).toBe(false);
  });

  it("任务列表：方框装饰 + 隐藏圆点", () => {
    const source = "- [x] 已完成\n- [ ] 未完成";
    const { doc, edits } = analyze(source);
    const tasks = edits.filter((edit) => edit.kind === "task");
    expect(tasks).toHaveLength(2);
    expect(tasks[0]).toMatchObject({ checked: true });
    expect(tasks[1]).toMatchObject({ checked: false });
    // 两行开头的 "- " 都被隐藏
    expect(hiddenText(doc, edits).filter((text) => text === "- ")).toHaveLength(2);
  });

  it("光标在任务行时露出 [x] 原文", () => {
    const source = "- [x] 已完成";
    const { doc, edits } = analyze(source, source.indexOf("[x]"));
    expect(edits.some((edit) => edit.kind === "task")).toBe(false);
    expect(hiddenText(doc, edits)).not.toContain("- ");
  });

  it("链接引用定义按元信息弱化显示，不隐藏", () => {
    const source = "见[官网][a]。\n\n[a]: https://example.com\n";
    const { doc, edits } = analyze(source);
    // 隐藏会留下一整行空行，前后空行叠起来就是一个明显的洞
    expect(hiddenText(doc, edits)).not.toContain("[a]: https://example.com");
    expect(classes(edits)).toContain("cm-md-meta");
  });

  it("无序列表的标记显示成圆点，光标进入该行退回源码", () => {
    const source = "- 第一项\n- 第二项\n";
    const { doc, edits } = analyze(source);
    const bullets = edits.filter((edit) => edit.kind === "bullet");
    expect(bullets.map((edit) => doc.sliceString(edit.from, edit.to))).toEqual(["-", "-"]);
    expect(bullets.map((edit) => (edit.kind === "bullet" ? edit.depth : -1))).toEqual([0, 0]);

    // 光标在第一行：只有第二行的圆点还在
    const focused = analyze(source, 3).edits.filter((edit) => edit.kind === "bullet");
    expect(focused.map((edit) => edit.from)).toEqual([source.indexOf("-", 1)]);
  });

  it("嵌套列表带上层级，符号与打印一致", () => {
    const source = "- 一层\n  - 二层\n    - 三层\n";
    const { edits } = analyze(source);
    const depths = edits.flatMap((edit) => (edit.kind === "bullet" ? [edit.depth] : []));
    expect(depths).toEqual([0, 1, 2]);
  });

  it("表情只在自己被触到时才退回源码", () => {
    const source = "表情：:smile: 与 :tada:";
    const { edits } = analyze(source);
    const chars = edits.flatMap((edit) => (edit.kind === "emoji" ? [edit.char] : []));
    expect(chars).toHaveLength(2);

    // 光标在第一个表情里：只有它退回源码，同行的第二个保持渲染
    const inside = analyze(source, source.indexOf(":smile:") + 2).edits.filter(
      (edit) => edit.kind === "emoji",
    );
    expect(inside).toHaveLength(1);
    expect(inside[0]?.from).toBe(source.indexOf(":tada:"));
  });

  it("同一行只展开光标触到的那个行内元素", () => {
    const source = "## 标题 **粗体** 与 [链接](https://e.com)";
    const cursor = source.indexOf("粗体") + 1;
    const { doc, edits } = analyze(source, cursor);
    const hidden = hiddenText(doc, edits);

    // 标题标记是块级：整行都算「在同一块里」，所以露出
    expect(hidden).not.toContain("## ");
    // 粗体自己的 ** 露出
    expect(hidden.filter((text) => text === "**")).toHaveLength(0);
    // 同行的链接标记仍然隐藏
    expect(hidden).toContain("[");
    expect(hidden).toContain("https://e.com");
  });

  it("行内标记互不牵连：光标在链接里，粗体保持隐藏", () => {
    const source = "**粗体** 与 [链接](https://e.com)";
    const cursor = source.indexOf("链接") + 1;
    const { doc, edits } = analyze(source, cursor);
    const hidden = hiddenText(doc, edits);
    expect(hidden).toEqual(["**", "**"]);
  });

  it("相同区间不会重复产出装饰", () => {
    const doc = Text.of(["**a**"]);
    const edits = collectEdits(doc, markdownLanguage.parser.parse("**a**"), [], [
      { from: 0, to: 5 },
      { from: 0, to: 5 },
    ]);
    const keys = edits.map((edit) => `${edit.kind}:${edit.from}:${"to" in edit ? edit.to : ""}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("定义列表", () => {
  it("术语加粗、解释缩进，行首 `: ` 隐藏", () => {
    const { doc, edits } = analyze("术语\n: 解释");
    expect(hiddenText(doc, edits)).toEqual([": "]);
    expect(classes(edits)).toEqual(
      expect.arrayContaining(["cm-md-def-term", "cm-md-def-detail"]),
    );
  });

  it("光标在解释行时露出 `: `", () => {
    const source = "术语\n: 解释";
    const { edits } = analyze(source, source.indexOf("解释"));
    expect(edits.filter((edit) => edit.kind === "hide")).toHaveLength(0);
  });

  it("普通两行段落不受影响", () => {
    const { doc, edits } = analyze("第一行\n第二行");
    expect(hiddenText(doc, edits)).toEqual([]);
    expect(classes(edits)).not.toContain("cm-md-def-term");
  });
});
