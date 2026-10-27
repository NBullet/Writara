import { markdownLanguage } from "@codemirror/lang-markdown";
import { describe, expect, it } from "vitest";

import { columnPercents, parseAlignment, parseTableSize, readTable, splitRow } from "./table";

function firstTable(source: string) {
  const tree = markdownLanguage.parser.parse(source);
  let table = null as ReturnType<typeof tree.topNode.getChild>;
  tree.iterate({
    enter: (node) => {
      if (node.name === "Table" && !table) table = node.node;
    },
  });
  if (!table) throw new Error("没有解析出表格");
  return readTable(source, table);
}

describe("readTable", () => {
  it("读出表头、行与对齐", () => {
    const grid = firstTable("| 左 | 中 | 右 |\n|:--|:-:|--:|\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |");
    expect(grid.header).toEqual(["左", "中", "右"]);
    expect(grid.rows).toEqual([
      ["1", "2", "3"],
      ["4", "5", "6"],
    ]);
    expect(grid.align).toEqual(["left", "center", "right"]);
  });

  it("没有对齐符号时为空字符串", () => {
    const grid = firstTable("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(grid.align).toEqual(["", ""]);
  });
});

describe("parseAlignment", () => {
  it("处理省略首尾竖线的写法", () => {
    expect(parseAlignment(":--|--:")).toEqual(["left", "right"]);
    expect(parseAlignment("|:-:|")).toEqual(["center"]);
  });
});

describe("splitRow", () => {
  it("支持 \\| 转义", () => {
    expect(splitRow("a \\| b | c")).toEqual(["a | b", "c"]);
    expect(splitRow("| a | b |")).toEqual(["a", "b"]);
  });

  it("空单元格补成同样列数（空行不会渲染成没有格子的 tr）", () => {
    const grid = firstTable("| A | B |\n| --- | --- |\n|  |  |\n| 1 | 2 |");
    expect(grid.rows[0]).toEqual(["", ""]);
    expect(grid.rows[1]).toEqual(["1", "2"]);
  });
});

describe("列宽（分隔行横线数）", () => {
  it("各列等宽时不算显式列宽", () => {
    expect(columnPercents("| --- | --- | --- |")).toEqual([]);
    expect(columnPercents("| :--- | :---: | ---: |")).toEqual([]);
  });

  it("横线数不等时按比例折算百分比", () => {
    expect(columnPercents("| --- | ------ | --- |")).toEqual([25, 50, 25]);
  });

  it("readTable 带上列宽", () => {
    const grid = firstTable("| a | b |\n| --- | ------- |\n| 1 | 2 |");
    expect(grid.percents).toEqual([30, 70]);
  });
});

describe("parseTableSize", () => {
  it("支持 x / × / * 与空格分隔", () => {
    expect(parseTableSize("3x4")).toEqual({ rows: 3, columns: 4 });
    expect(parseTableSize("4 × 2")).toEqual({ rows: 4, columns: 2 });
    expect(parseTableSize(" 5 * 3 ")).toEqual({ rows: 5, columns: 3 });
  });

  it("解析不出来退回 3x3，超出上限夹到上限", () => {
    expect(parseTableSize("")).toEqual({ rows: 3, columns: 3 });
    expect(parseTableSize("表格")).toEqual({ rows: 3, columns: 3 });
    expect(parseTableSize("99x99")).toEqual({ rows: 20, columns: 12 });
    expect(parseTableSize("0x0")).toEqual({ rows: 1, columns: 1 });
  });
});
