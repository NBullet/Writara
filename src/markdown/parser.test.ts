import { describe, expect, it } from "vitest";

import { writaraParser } from "./parser";

function nodeNames(source: string): string[] {
  const tree = writaraParser.parse(source);
  const names: string[] = [];
  tree.iterate({ enter: (node) => { names.push(node.name); } });
  return names;
}

describe("writaraParser", () => {
  it("行内公式与高亮只在同一行内闭合", () => {
    expect(nodeNames("$a$")).toContain("InlineMath");
    expect(nodeNames("==a==")).toContain("Highlight");

    // 跨行不配对：否则会产生跨行 replace 装饰，CodeMirror 会直接抛错
    expect(nodeNames("$a\nb$")).not.toContain("InlineMath");
    expect(nodeNames("==a\nb==")).not.toContain("Highlight");
  });

  it("代码块里的符号不产生节点", () => {
    expect(nodeNames("```\n$a$\n==b==\n```")).not.toContain("InlineMath");
  });

  it("块级公式的 $$ 不会生成行内公式", () => {
    expect(nodeNames("$$\nx^2\n$$")).not.toContain("InlineMath");
  });

  it("脚注引用不会被当成上标，两个引用各自成节点", () => {
    const source = "脚注[^1]，第二个[^2]。\n\n[^1]: 甲\n[^2]: 乙\n";
    const tree = writaraParser.parse(source);
    const links: string[] = [];
    tree.iterate({
      enter: (node) => {
        if (node.name === "Link") links.push(source.slice(node.from, node.to));
      },
    });
    expect(links).toEqual(["[^1]", "[^2]"]);
  });

  it("普通上标仍然可用", () => {
    expect(nodeNames("x^2^")).toContain("Superscript");
    expect(nodeNames("x^2^")).toContain("SuperscriptMark");
  });
});
