// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { forceParsing } from "@codemirror/language";
import { afterEach, describe, expect, it } from "vitest";

import { writaraExtensions } from "./extensions";
import {
  clearFormatting,
  deleteLine,
  demoteHeading,
  findTableContext,
  indentBlock,
  indentList,
  insertCodeBlock,
  insertFootnote,
  insertFrontMatter,
  insertHorizontalRule,
  insertLink,
  insertTable,
  insertToc,
  promoteHeading,
  selectBlock,
  selectLine,
  setHeading,
  tableAddColumn,
  tableAddRow,
  tableAlign,
  tableDeleteColumn,
  tableDeleteRow,
  toggleBlockquote,
  toggleBold,
  toggleCode,
  toggleComment,
  toggleHighlight,
  toggleItalic,
  toggleList,
  toggleStrike,
  toggleUnderline,
} from "./commands";

let view: EditorView | null = null;

function mount(doc: string, anchor = 0, head = anchor): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({ doc, selection: { anchor, head }, extensions: writaraExtensions() }),
  });
  return view;
}

afterEach(() => {
  view?.destroy();
  view = null;
});

const text = () => view!.state.doc.toString();

describe("标题", () => {
  it("设置与取消标题级别", () => {
    mount("标题");
    setHeading(view!, 2);
    expect(text()).toBe("## 标题");
    setHeading(view!, 0);
    expect(text()).toBe("标题");
  });

  it("提升 / 降低级别", () => {
    mount("### 标题", 5);
    promoteHeading(view!);
    expect(text()).toBe("## 标题");
    demoteHeading(view!);
    expect(text()).toBe("### 标题");
  });
});

describe("行内格式", () => {
  it("加粗：包裹、取消、空选区", () => {
    mount("文字", 0, 2);
    toggleBold(view!);
    expect(text()).toBe("**文字**");

    mount("**文字**", 2, 4);
    toggleBold(view!);
    expect(text()).toBe("文字");

    mount("hello", 2, 2);
    toggleBold(view!);
    expect(text()).toBe("he****llo");
    expect(view!.state.selection.main.head).toBe(4);
  });

  it("斜体 / 删除线 / 高亮 / 行内代码 / 下划线 / 注释", () => {
    mount("文字", 0, 2);
    toggleItalic(view!);
    expect(text()).toBe("*文字*");

    mount("文字", 0, 2);
    toggleStrike(view!);
    expect(text()).toBe("~~文字~~");

    mount("文字", 0, 2);
    toggleHighlight(view!);
    expect(text()).toBe("==文字==");

    mount("文字", 0, 2);
    toggleCode(view!);
    expect(text()).toBe("`文字`");

    mount("文字", 0, 2);
    toggleUnderline(view!);
    expect(text()).toBe("<u>文字</u>");

    mount("文字", 0, 2);
    toggleComment(view!);
    expect(text()).toBe("<!-- 文字 -->");
  });

  it("清除行内标记", () => {
    const source = "**粗** 与 *斜* 和 `代码`";
    mount(source, 0, source.length);
    clearFormatting(view!);
    expect(text()).toBe("粗 与 斜 和 代码");
  });
});

describe("块级", () => {
  it("引用与三种列表可以来回切换", () => {
    mount("第一行\n第二行", 0, 7);
    toggleBlockquote(view!);
    expect(text()).toBe("> 第一行\n> 第二行");
    toggleBlockquote(view!);
    expect(text()).toBe("第一行\n第二行");

    toggleList(view!, "bullet");
    expect(text()).toBe("- 第一行\n- 第二行");
    toggleList(view!, "ordered");
    expect(text()).toBe("1. 第一行\n2. 第二行");
    toggleList(view!, "task");
    expect(text()).toBe("- [ ] 第一行\n- [ ] 第二行");
    toggleList(view!, "task");
    expect(text()).toBe("第一行\n第二行");
  });

  it("列表缩进", () => {
    const doc = "- 一\n- 项目";
    mount(doc, doc.indexOf("- 项目") + 2);
    forceParsing(view!, view!.state.doc.length);
    indentList(view!, 1);
    expect(text()).toBe("- 一\n  - 项目");
    indentList(view!, -1);
    expect(text()).toBe(doc);
  });

  it("Tab 缩进列表项时子项跟着走", () => {
    const doc = "- 一\n- 二\n  - 子";
    mount(doc, doc.indexOf("- 二") + 2);
    forceParsing(view!, view!.state.doc.length);
    indentBlock(view!, 1);
    expect(text()).toBe("- 一\n  - 二\n    - 子");
    indentBlock(view!, -1);
    expect(text()).toBe(doc);
  });

  it("第一个列表项与重复 Tab 都不会无限右移", () => {
    mount("- 一\n- 二", 2);
    forceParsing(view!, view!.state.doc.length);
    indentBlock(view!, 1);
    expect(text()).toBe("- 一\n- 二");

    mount("- 一\n- 二", "- 一\n- 二".indexOf("- 二") + 2);
    forceParsing(view!, view!.state.doc.length);
    indentBlock(view!, 1);
    expect(text()).toBe("- 一\n  - 二");
    // 已经挂到上一个兄弟项下面：再按 Tab 不再右移
    indentBlock(view!, 1);
    expect(text()).toBe("- 一\n  - 二");
  });

  it("引用里的列表缩进保留 > 前缀", () => {
    const doc = "> - 一\n> - 二";
    mount(doc, doc.indexOf("> - 二") + 4);
    forceParsing(view!, view!.state.doc.length);
    indentBlock(view!, 1);
    expect(text()).toBe("> - 一\n>   - 二");
  });

  it("Tab 在普通段落里插入缩进单位，Shift+Tab 退掉", () => {
    mount("正文", 0);
    indentBlock(view!, 1);
    expect(text()).toBe("  正文");
    indentBlock(view!, -1);
    expect(text()).toBe("正文");
  });

  it("有序列表的缩进步长按标记宽度算", () => {
    const doc = "1. 一\n2. 二";
    mount(doc, doc.indexOf("2. 二") + 2);
    forceParsing(view!, view!.state.doc.length);
    indentBlock(view!, 1);
    expect(text()).toBe("1. 一\n   2. 二");
    indentBlock(view!, -1);
    expect(text()).toBe(doc);
  });

  it("选中多行时 Tab 整段缩进", () => {
    mount("一\n二", 0, 3);
    indentBlock(view!, 1);
    expect(text()).toBe("  一\n  二");
  });

  it("插入分隔线、目录、Front Matter", () => {
    mount("正文", 2);
    insertHorizontalRule(view!);
    expect(text()).toContain("---");

    mount("正文", 2);
    insertToc(view!);
    expect(text()).toBe("正文[TOC]\n\n");

    mount("正文", 0);
    insertFrontMatter(view!, "文档");
    expect(text().startsWith("---\ntitle: 文档\n---\n\n")).toBe(true);
  });

  it("包裹代码块与链接", () => {
    mount("const a = 1;", 0, 12);
    insertCodeBlock(view!);
    expect(text()).toBe("```\nconst a = 1;\n```\n");

    mount("文字", 0, 2);
    insertLink(view!);
    expect(text()).toBe("[文字](url)");
    expect(view!.state.sliceDoc(view!.state.selection.main.from, view!.state.selection.main.to)).toBe("url");
  });

  it("脚注同时插入引用与定义", () => {
    mount("正文", 2);
    insertFootnote(view!);
    expect(text()).toContain("正文[^1]");
    expect(text()).toContain("[^1]: ");
  });
});

describe("表格", () => {
  const table = "| 名称 | 数量 |\n| --- | --: |\n| 苹果 | 1 |\n| 梨 | 2 |";

  function mountInTable(rowText = "苹果"): EditorView {
    const doc = table;
    const pos = doc.indexOf(rowText) + 1;
    return mount(doc, pos);
  }

  it("识别光标所在行列", () => {
    const editor = mountInTable("梨");
    const context = findTableContext(editor.state);
    expect(context?.rowIndex).toBe(2);
    expect(context?.columnIndex).toBe(0);
  });

  it("加行 / 删行", () => {
    const editor = mountInTable("苹果");
    tableAddRow(editor, "below");
    expect(text().split("\n")).toHaveLength(5);

    tableDeleteRow(editor);
    expect(text().split("\n")).toHaveLength(4);
  });

  it("加列 / 删列 / 对齐", () => {
    const editor = mountInTable("苹果");
    tableAddColumn(editor, "right");
    expect(text().split("\n")[0]).toBe("| 名称 |  | 数量 |");

    // 删除的是光标所在列（名称）
    tableDeleteColumn(editor);
    expect(text().split("\n")[0]).toBe("|  | 数量 |");

    tableAlign(editor, "center");
    expect(text().split("\n")[1]).toContain(":---:");
  });

  it("插入新表格", () => {
    mount("", 0);
    insertTable(view!, 2, 2);
    expect(text()).toContain("| 列1 | 列2 |");
    expect(text()).toContain("| --- | --- |");
  });
});

describe("选择与删除", () => {
  it("选中当前行与段落", () => {
    mount("第一行\n第二行\n\n另一段", 1);
    selectLine(view!);
    expect(view!.state.sliceDoc(view!.state.selection.main.from, view!.state.selection.main.to)).toBe("第一行");

    selectBlock(view!);
    expect(view!.state.sliceDoc(view!.state.selection.main.from, view!.state.selection.main.to)).toBe(
      "第一行\n第二行",
    );
  });

  it("删除当前行", () => {
    mount("第一行\n第二行", 1);
    deleteLine(view!);
    expect(text()).toBe("第二行");
  });
});
