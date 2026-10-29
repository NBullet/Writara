// @vitest-environment jsdom
import { forceParsing } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { initialCaret } from "../create-editor";
import { writaraExtensions } from "../extensions";
import { setSourceMode, setViewModes } from "../modes";
import { openSearchPanel } from "@codemirror/search";

let views: EditorView[] = [];

/**
 * 必须在读 DOM 前 forceParsing：jsdom 没有解析 worker 的空闲回调，
 * 否则语法树可能只解析到一半，装饰数量取决于时序。
 */
function mount(doc: string, anchor = 0): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  const view = new EditorView({
    parent,
    state: EditorState.create({ doc, selection: { anchor }, extensions: writaraExtensions() }),
  });
  forceParsing(view, view.state.doc.length);
  views.push(view);
  return view;
}

afterEach(() => {
  for (const view of views) view.destroy();
  views = [];
});

/** 端到端检查：装饰真的落到了 DOM 上，而不只是 analyze 的返回值。 */
describe("live preview 装饰", () => {
  it("视口内隐藏标记", () => {
    const editor = mount("前言\n\n正文 **加粗** 与 `code` 结束");
    expect(editor.contentDOM.textContent).toBe("前言正文 加粗 与 code 结束");
  });

  it("删除线也走同一套隐藏逻辑", () => {
    const editor = mount("前言\n\n以及 ~~删除线~~ 结束");
    expect(editor.contentDOM.textContent).toBe("前言以及 删除线 结束");
  });

  it("光标所在行露出源码标记", () => {
    const editor = mount("**加粗**", 1);
    expect(editor.contentDOM.textContent).toBe("**加粗**");
  });

  it("标题带层级行装饰，标记被吞掉", () => {
    const editor = mount("## 二级标题\n\n正文", 9);
    const line = editor.contentDOM.querySelector(".cm-line");
    expect(line?.className).toContain("cm-md-heading-2");
    expect(editor.contentDOM.textContent).toBe("二级标题正文");
  });

  it("svg 块渲染成图形，脚本被清洗", () => {
    const editor = mount(
      [
        "上文",
        "",
        '<svg viewBox="0 0 10 10">',
        "  <script>alert(1)</script>",
        '  <circle r="4"/>',
        "</svg>",
        "",
        "下文",
      ].join("\n"),
    );
    const host = editor.contentDOM.querySelector(".cm-md-svg");
    expect(host).not.toBeNull();
    expect(host?.querySelector("svg")).not.toBeNull();
    expect(host?.querySelector("circle")).not.toBeNull();
    expect(host?.querySelector("script")).toBeNull();
    expect(host?.textContent?.trim()).toBe("");
  });

  it("光标在 svg 块内时显示源码而不是图形", () => {
    const doc = '上文\n\n<svg viewBox="0 0 10 10"><circle r="4"/></svg>';
    const editor = mount(doc, doc.indexOf("<circle"));
    expect(editor.contentDOM.querySelector(".cm-md-svg")).toBeNull();
  });

  it("表格渲染成真实表格，行内标记也解析", () => {
    const doc = "前言\n\n| 左 | 右 |\n|:--|--:|\n| **粗** | 2 |";
    const editor = mount(doc);
    expect(editor.contentDOM.querySelector(".cm-md-table table")).not.toBeNull();
    expect(editor.contentDOM.querySelectorAll(".cm-md-table th").length).toBe(2);
    expect(editor.contentDOM.querySelector(".cm-md-table strong")?.textContent).toBe("粗");
    expect(editor.contentDOM.querySelector(".cm-md-table .wr-align-right")).not.toBeNull();
  });

  it("光标进入表格时表格仍在（编辑态不再退回源码）", () => {
    const doc = "前言\n\n| 左 | 右 |\n|:--|--:|\n| 1 | 2 |";
    const editor = mount(doc, doc.indexOf("| 左"));
    expect(editor.contentDOM.querySelector(".cm-md-table")).not.toBeNull();
    expect(editor.contentDOM.textContent).not.toContain("|:--|");
  });

  it("图片渲染成 img", () => {
    const editor = mount("前文\n\n![图](https://example.com/a.png)");
    const image = editor.contentDOM.querySelector<HTMLImageElement>(".cm-md-image img");
    expect(image?.getAttribute("src")).toBe("https://example.com/a.png");
    expect(image?.getAttribute("alt")).toBe("图");
  });

  it("图片尺寸写进 img 属性", () => {
    const editor = mount("前文\n\n![图](https://example.com/a.png =120x80)");
    const image = editor.contentDOM.querySelector<HTMLImageElement>(".cm-md-image img");
    expect(image?.getAttribute("width")).toBe("120");
    expect(image?.getAttribute("height")).toBe("80");
  });

  it("非法图片协议退化成占位", () => {
    const editor = mount("前文\n\n![x](javascript:alert)");
    expect(editor.contentDOM.querySelector(".cm-md-image.is-blocked")).not.toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-image img")).toBeNull();
  });

  it("光标进入图片时显示源码", () => {
    const doc = "前文\n\n![图](https://example.com/a.png)";
    const editor = mount(doc, doc.indexOf("!["));
    expect(editor.contentDOM.querySelector(".cm-md-image")).toBeNull();
  });

  it("源码模式与专注模式可以反复切换", () => {
    const editor = mount("前言\n\n**粗体**");
    expect(editor.contentDOM.textContent).toBe("前言粗体");

    setSourceMode(editor, true);
    expect(editor.dom.classList.contains("cm-source-mode")).toBe(true);
    expect(editor.contentDOM.textContent).toContain("**粗体**");

    setSourceMode(editor, false);
    expect(editor.dom.classList.contains("cm-source-mode")).toBe(false);
    expect(editor.contentDOM.textContent).toBe("前言粗体");

    setViewModes(editor, { focus: true, typewriter: false });
    expect(editor.dom.classList.contains("cm-focus")).toBe(true);

    setViewModes(editor, { focus: false, typewriter: true });
    expect(editor.dom.classList.contains("cm-focus")).toBe(false);
  });

  it("高亮、上下标在编辑器里隐藏标记", () => {
    const editor = mount("前言\n\n==高亮== 与 H~2~O 和 x^2^");
    expect(editor.contentDOM.querySelector(".cm-md-mark")).not.toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-sub")).not.toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-sup")).not.toBeNull();
    expect(editor.contentDOM.textContent).toBe("前言高亮 与 H2O 和 x2");
  });

  it("行内公式渲染成 KaTeX，公式块渲染成块", () => {
    const inline = mount("前言\n\n质能方程 $E=mc^2$");
    expect(inline.contentDOM.querySelector(".cm-md-math .katex")).not.toBeNull();

    const block = mount("前言\n\n$$\n\\int_0^1 x dx\n$$");
    expect(block.contentDOM.querySelector(".cm-md-math-block .katex-display")).not.toBeNull();
  });

  it("公式块聚焦时显示源码与实时预览，✓ 结束后恢复公式", () => {
    const doc = "前言\n\n$$\n\\int_0^1 x dx\n$$";
    const editor = mount(doc, doc.indexOf("\\int"));

    expect(editor.contentDOM.querySelector(".cm-md-math-block")).toBeNull();
    expect(editor.contentDOM.textContent).toContain("\\int_0^1 x dx");

    const preview = editor.contentDOM.querySelector(".cm-md-math-preview");
    expect(preview).not.toBeNull();
    expect(preview?.querySelector(".katex")).not.toBeNull();

    preview
      ?.querySelector<HTMLButtonElement>(".cm-md-preview-done")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(editor.contentDOM.querySelector(".cm-md-math-preview")).toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-math-block")).not.toBeNull();
    // 文档末尾补一个换行，光标才有「块外」可落
    expect(editor.state.doc.length).toBe(doc.length + 1);
    expect(editor.state.selection.main.head).toBe(doc.length + 1);
  });

  it("公式块在文档中间时，✓ 只移动光标、不改文档", () => {
    const doc = "前言\n\n$$\nx\n$$\n\n后文";
    const editor = mount(doc, doc.indexOf("\nx\n") + 1);

    editor.contentDOM
      .querySelector<HTMLButtonElement>(".cm-md-math-preview .cm-md-preview-done")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    const after = doc.indexOf("\n", doc.lastIndexOf("$$")) + 1;
    expect(editor.state.doc.toString()).toBe(doc);
    expect(editor.state.selection.main.head).toBe(after);
    expect(editor.contentDOM.querySelector(".cm-md-math-block")).not.toBeNull();
  });

  it("Mod-Enter 退出公式编辑", () => {
    const doc = "前言\n\n$$\nx\n$$\n\n后文";
    const editor = mount(doc, doc.indexOf("\nx\n") + 1);
    expect(editor.contentDOM.querySelector(".cm-md-math-preview")).not.toBeNull();

    editor.contentDOM.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", code: "Enter", ctrlKey: true, bubbles: true }),
    );

    expect(editor.contentDOM.querySelector(".cm-md-math-preview")).toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-math-block")).not.toBeNull();
  });

  it("TOC 渲染成可点击目录，光标进入回到源码", () => {
    const doc = "# 一\n\n[TOC]\n\n## 二";
    const editor = mount(doc);
    const toc = editor.contentDOM.querySelector(".cm-md-toc");
    expect(toc).not.toBeNull();
    expect(toc?.querySelectorAll("li button").length).toBe(2);
    // 悬浮工具条：刷新 / 移除
    expect(toc?.querySelectorAll(".cm-md-toc-tools button").length).toBe(2);

    const editing = mount(doc, doc.indexOf("[TOC]"));
    expect(editing.contentDOM.querySelector(".cm-md-toc")).toBeNull();
  });

  it("围栏代码块显示语言标签与复制按钮，进入围栏行时显示源码", () => {
    const doc = "前言\n\n```ts\nconst a = 1;\n```";
    const editor = mount(doc);
    expect(editor.contentDOM.querySelector(".cm-md-lang span")?.textContent).toBe("ts");
    expect(editor.contentDOM.querySelector(".cm-md-copy")?.textContent).toBe("复制");
    // 上下围栏行都铺代码底色，充当代码块的上下内边距
    expect(editor.contentDOM.querySelector(".cm-md-code-fence-open")).not.toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-code-fence-close")).not.toBeNull();

    const editing = mount(doc, doc.indexOf("```"));
    expect(editing.contentDOM.querySelector(".cm-md-lang")).toBeNull();
  });

  it("点击 SVG 图形时光标落到源码块开头", () => {
    const doc = '前言\n\n<svg viewBox="0 0 10 10">\n<rect width="4"/>\n</svg>';
    const editor = mount(doc);
    const svg = editor.contentDOM.querySelector<HTMLElement>(".cm-md-svg");
    expect(svg).not.toBeNull();

    svg?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(editor.state.selection.main.head).toBe(doc.indexOf("<svg"));
    expect(editor.contentDOM.querySelector(".cm-md-svg")).toBeNull();
  });

  it("点击 mermaid 图表进入编辑态，光标落在代码首行", () => {
    const doc = "前言\n\n```mermaid\ngraph TD; A-->B;\n```";
    const editor = mount(doc);
    const chart = editor.contentDOM.querySelector<HTMLElement>(".cm-md-mermaid");
    expect(chart).not.toBeNull();

    chart?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(editor.state.selection.main.head).toBe(doc.indexOf("graph TD"));
    expect(editor.contentDOM.querySelector(".cm-md-mermaid")).toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-mermaid-preview")).not.toBeNull();
  });

  it("点击表格单元格打开浮层编辑器，回车写回源码", () => {
    const doc = "前言\n\n| 名称 | 数量 |\n| --- | --- |\n| 苹果 | 1 |";
    const editor = mount(doc);
    const cell = editor.contentDOM.querySelector<HTMLTableCellElement>(".cm-md-table td");
    expect(cell).not.toBeNull();

    cell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const input = editor.contentDOM.querySelector<HTMLInputElement>(".cm-md-cell-editor");
    expect(input).not.toBeNull();
    expect(input?.value).toBe("苹果");

    if (input) {
      input.value = "香蕉";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }

    expect(editor.state.doc.toString()).toContain("| 香蕉 | 1 |");
    // 表格保持渲染态，没有整块退回源码
    expect(editor.contentDOM.querySelector(".cm-md-table")).not.toBeNull();
  });

  it("表格工具条可以改当前列的对齐", () => {
    const doc = "| 左 | 右 |\n| --- | --- |\n| 1 | 2 |";
    const editor = mount(doc);
    const button = editor.contentDOM.querySelector<HTMLButtonElement>('[data-align="center"]');
    expect(button).not.toBeNull();

    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(editor.state.doc.toString()).toContain(":---:");
  });

  it("表格单元格里的竖线会被转义，不会切出一列", () => {
    const doc = "| 名称 | 数量 |\n| --- | --- |\n| a | 1 |";
    const editor = mount(doc);
    const cell = editor.contentDOM.querySelector<HTMLTableCellElement>(".cm-md-table td");
    cell?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    const input = editor.contentDOM.querySelector<HTMLInputElement>(".cm-md-cell-editor");
    if (input) {
      input.value = "a|b";
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    }
    expect(editor.state.doc.toString()).toContain("a\\|b");
  });

  it("mermaid 阅读态是图表，聚焦时源码与预览面板并存，✓ 结束后恢复图表", () => {
    const doc = "前言\n\n```mermaid\ngraph TD; A-->B;\n```";

    const reading = mount(doc);
    expect(reading.contentDOM.querySelector(".cm-md-mermaid")).not.toBeNull();
    expect(reading.contentDOM.textContent).not.toContain("graph TD");

    const editor = mount(doc, doc.indexOf("graph"));
    expect(editor.contentDOM.querySelector(".cm-md-mermaid")).toBeNull();
    expect(editor.contentDOM.textContent).toContain("graph TD");

    const preview = editor.contentDOM.querySelector(".cm-md-mermaid-preview");
    expect(preview).not.toBeNull();
    expect(preview?.querySelector(".cm-md-preview-body")).not.toBeNull();
    expect(preview?.querySelector(".cm-md-preview-done")).not.toBeNull();

    preview
      ?.querySelector<HTMLButtonElement>(".cm-md-preview-done")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(editor.contentDOM.querySelector(".cm-md-mermaid-preview")).toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-mermaid")).not.toBeNull();
  });

  it("脚注引用显示为上标数字，光标进入回到源码", () => {
    const doc = "前言\n\n正文[^1]\n\n[^1]: 注释内容";
    const editor = mount(doc);
    expect(editor.contentDOM.querySelector(".cm-md-fn")?.textContent).toBe("1");

    const editing = mount(doc, doc.indexOf("[^1]"));
    expect(editing.contentDOM.querySelector(".cm-md-fn")).toBeNull();
  });

  it("查找面板可以打开", () => {
    const editor = mount("前文");
    openSearchPanel(editor);
    expect(editor.dom.querySelector(".cm-search")).not.toBeNull();
  });

  it("Tab 在编辑器里缩进列表项，不把焦点带出编辑区", () => {
    const doc = "- 一\n- 项目";
    const editor = mount(doc, doc.indexOf("- 项目") + 2);
    const event = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    editor.contentDOM.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.state.doc.toString()).toBe("- 一\n  - 项目");
  });

  it("任务列表渲染成可点击方框，点击写回文档", () => {    const editor = mount("前言\n\n- [ ] 待办");
    const box = editor.contentDOM.querySelector<HTMLElement>(".cm-md-task");
    expect(box?.textContent).toBe("☐");

    box?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(editor.state.doc.toString()).toBe("前言\n\n- [x] 待办");
    const after = editor.contentDOM.querySelector<HTMLElement>(".cm-md-task");
    expect(after?.textContent).toBe("☑");
  });

  it("表格里按 Tab 连跳下一格；末格再 Tab 追加一行", async () => {
    const doc = "| A | B |\n| --- | --- |\n| a1 | b1 |";
    const editor = mount(doc);
    const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
    const input = () => editor.contentDOM.querySelector<HTMLInputElement>(".cm-md-cell-editor");

    editor.contentDOM
      .querySelector<HTMLTableCellElement>(".cm-md-table td")
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(input()?.value).toBe("a1");

    // 改内容后 Tab：提交 → widget 重建 → 自动打开下一格
    input()!.value = "A1";
    input()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await tick();
    expect(editor.state.doc.toString()).toContain("| A1 | b1 |");
    expect(input()?.value).toBe("b1");

    // 末格 Tab → 追加一行并进新行第一格
    input()!.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    await tick();
    const lines = editor.state.doc.toString().split("\n");
    expect(lines).toHaveLength(4);
    expect(lines[3]).toBe("|  |  |");
    expect(input()?.value).toBe("");
  });

  it("表格里 Shift+Tab 按阅读顺序回退，走到表头第一格再退出", () => {
    const doc = "| A | B |\n| --- | --- |\n| a1 | b1 |";
    const editor = mount(doc);
    const input = () => editor.contentDOM.querySelector<HTMLInputElement>(".cm-md-cell-editor");
    const back = () =>
      input()!.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }),
      );

    editor.contentDOM
      .querySelectorAll<HTMLTableCellElement>(".cm-md-table td")[0]
      ?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(input()?.value).toBe("a1");

    // 正文第一格 → 表头最后一格 → 表头第一格
    back();
    expect(input()?.value).toBe("B");
    back();
    expect(input()?.value).toBe("A");

    // 已经是第一格：提交并退出
    back();
    expect([...editor.contentDOM.querySelectorAll<HTMLInputElement>(".cm-md-cell-editor")]).toHaveLength(0);
    expect(editor.state.doc.toString()).toContain("| a1 | b1 |");
  });

  it("HTML 块失焦渲染成真 HTML，聚焦时回到源码并挂预览面板", () => {
    const doc = "前言\n\n<div class=\"box\"><b>粗</b></div>";
    const editor = mount(doc);
    const host = editor.contentDOM.querySelector<HTMLElement>(".cm-md-html");
    expect(host).not.toBeNull();
    expect(host?.querySelector("b")?.textContent).toBe("粗");
    expect(host?.querySelector("script")).toBeNull();

    // 点块进入编辑态：源码留在原位，块后出现预览面板
    host?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(editor.contentDOM.querySelector(".cm-md-html")).toBeNull();
    expect(editor.contentDOM.querySelector(".cm-md-html-preview")).not.toBeNull();
    expect(editor.contentDOM.querySelectorAll(".cm-md-html-edit").length).toBeGreaterThan(0);
  });

  it("清洗后为空的 HTML 块保留源码，不制造空块", () => {
    const editor = mount("前言\n\n<script>alert(1)</script>");
    expect(editor.contentDOM.querySelector(".cm-md-html")).toBeNull();
    expect(editor.contentDOM.textContent).toContain("alert(1)");
  });

  it("图片浮条按正文宽度换算尺寸，并写回 =宽 语法", async () => {
    const src = "data:image/png;base64,iVBORw0KGgo=";
    const doc = `前言\n\n![图](${src} =120)`;
    const editor = mount(doc, 0);

    // 光标触到图片 → 浮条出现（图片本身退回源码）
    editor.dispatch({ selection: { anchor: doc.indexOf("![图]") + 2 } });
    const bar = editor.dom.querySelector<HTMLElement>(".cm-md-image-toolbar");
    expect(bar).not.toBeNull();

    const button = bar?.querySelector<HTMLButtonElement>('[data-size="50"]');
    expect(button).not.toBeNull();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    // jsdom 里没有真实布局，用兜底宽度 600 → 50% = 300
    expect(editor.state.doc.toString()).toContain("=300)");
  });

  it("点击图片把光标放进节点，而不是落到下一行", () => {
    const src = "data:image/png;base64,iVBORw0KGgo=";
    const doc = `前言\n\n![图](${src} =120)\n\n后面`;
    const editor = mount(doc, 0);
    const host = editor.contentDOM.querySelector<HTMLElement>(".cm-md-image");
    expect(host).not.toBeNull();

    host?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    // 行内原子 widget 点中间时 posAtCoords 会落到下一行，浮条就永远不出来
    expect(editor.state.selection.main.head).toBe(doc.indexOf("![图]"));
    expect(editor.contentDOM.querySelector(".cm-md-image")).toBeNull();
  });

  it("<details> 跨空行被拆成多个 HTML 块时重新接成一段渲染", () => {
    const doc = "前言\n\n<details>\n<summary>标题</summary>\n\n正文内容\n\n</details>\n\n后面";
    const editor = mount(doc);
    const blocks = editor.contentDOM.querySelectorAll(".cm-md-html");
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.querySelector("details")).not.toBeNull();
    expect(blocks[0]?.textContent).toContain("正文内容");
  });

  it("没闭合的标签不会把后面整篇吞掉", () => {
    const doc = "<div>开了没关\n\n普通段落\n\n<!-- 这里没有 </div> -->";
    const editor = mount(doc);
    // 段落仍然按 Markdown 渲染（没有被并进 HTML 块）
    expect(editor.contentDOM.textContent).toContain("普通段落");
  });

  it("表格工具条的「源码」按 Markdown 源码打开整张表", () => {
    const doc = "| A | B |\n| --- | --- |\n| 1 | 2 |";
    const editor = mount(doc);
    expect(editor.contentDOM.querySelector(".cm-md-table")).not.toBeNull();

    const button = [...editor.contentDOM.querySelectorAll<HTMLButtonElement>(".cm-md-tb")].find(
      (el) => el.textContent === "源码",
    );
    expect(button).not.toBeNull();
    button?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(editor.contentDOM.querySelector(".cm-md-table")).toBeNull();
    expect(editor.contentDOM.textContent).toContain("| --- |");

    // 光标移出表格 → 恢复成表格
    editor.dispatch({ selection: { anchor: 0 } });
    expect(editor.contentDOM.querySelector(".cm-md-table")).not.toBeNull();
  });

  it("Front Matter 阅读态折叠成一行摘要，点开露出原始 YAML", () => {
    const doc = "---\ntitle: 我的标题\ndate: 2026-01-01\nauthor: 测试\n---\n\n正文";
    const editor = mount(doc, doc.length);
    const summary = editor.contentDOM.querySelector(".cm-md-meta-summary");
    expect(summary).not.toBeNull();
    expect(summary?.textContent).toContain("我的标题");
    expect(editor.contentDOM.textContent).not.toContain("---");

    // 点摘要 → 光标进入 front matter，露出原始 YAML
    summary?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(editor.state.selection.main.head).toBe(0);
    expect(editor.contentDOM.querySelector(".cm-md-meta-summary")).toBeNull();
    expect(editor.contentDOM.textContent).toContain("title: 我的标题");
  });

  it("目录工具条可以移除 [TOC]", () => {
    const doc = "# 一\n\n[TOC]\n\n## 二";
    const editor = mount(doc);
    const remove = [...(editor.contentDOM.querySelectorAll<HTMLButtonElement>(".cm-md-toc-tools button"))].find(
      (el) => el.textContent === "移除",
    );
    expect(remove).toBeTruthy();
    remove?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(editor.state.doc.toString()).not.toContain("[TOC]");
  });

  it("跨块选区保持表格渲染，选区完全落在表内才退回源码", () => {
    const doc = "前言\n\n| A | B |\n| --- | --- |\n| 1 | 2 |";
    const editor = mount(doc);

    editor.dispatch({ selection: { anchor: 0, head: doc.length } });
    expect(editor.contentDOM.querySelector(".cm-md-table")).not.toBeNull();

    const inside = doc.indexOf("| 1");
    editor.dispatch({ selection: { anchor: inside + 1, head: inside + 4 } });
    expect(editor.contentDOM.querySelector(".cm-md-table")).toBeNull();
  });
});

describe("initialCaret", () => {
  it("跳过 YAML Front Matter，落在正文第一行", () => {
    const doc = "---\ntitle: T\n---\n\n正文";
    expect(initialCaret(doc)).toBe(doc.indexOf("正文"));
    expect(initialCaret("没有 front matter")).toBe(0);
  });
});