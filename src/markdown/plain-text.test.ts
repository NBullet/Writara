import { describe, expect, it } from "vitest";

import { toPlainText } from "./plain-text";

describe("toPlainText", () => {
  it("去掉强调、代码、链接标记", () => {
    expect(toPlainText("**粗** 与 *斜* 和 `代码`")).toBe("粗 与 斜 和 代码");
    expect(toPlainText("[文字](https://example.com)")).toBe("文字");
    expect(toPlainText("![图](a.png)")).toBe("图");
  });

  it("去掉标题、列表、引用的前缀", () => {
    expect(toPlainText("## 标题")).toBe("标题");
    expect(toPlainText("- 项目\n- 另一个")).toBe("项目\n另一个");
    expect(toPlainText("1. 第一\n2. 第二")).toBe("第一\n第二");
    expect(toPlainText("> 引用")).toBe("引用");
    expect(toPlainText("- [x] 完成")).toBe("完成");
  });

  it("表格转成空格分隔", () => {
    expect(toPlainText("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe("a b\n1 2");
  });

  it("保留普通文本", () => {
    expect(toPlainText("一段普通的文字。")).toBe("一段普通的文字。");
  });
});
