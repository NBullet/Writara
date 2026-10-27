import { describe, expect, it } from "vitest";
import { markdownLanguage } from "@codemirror/lang-markdown";

import { writaraParser } from "./parser";
import { columnWeights, parseAlignment } from "./table";
import {
  columnAt,
  deleteColumn,
  deleteRow,
  deleteTable,
  formatTable,
  insertColumn,
  insertRow,
  setColumnAlignment,
  setColumnWidths,
  tableAt,
  weightsFromFractions,
  type TableChange,
} from "./table-edit";

const SOURCE = [
  "| 能力 | 编辑器 | 打印 |",
  "| :--- | :---: | ---: |",
  "| 表格 | 真表格 | 重复表头 |",
  "| 代码 | 高亮 | 折行 |",
].join("\n");

/** 找到第一张表，并把光标放到 `|` 的某个位置。 */
function target(source: string, pos: number) {
  const tree = writaraParser.parse(source);
  const found: Array<{ from: number; to: number }> = [];
  tree.iterate({
    enter: (node) => {
      if (node.name === "Table") found.push({ from: node.from, to: node.to });
    },
  });
  const table = found[0];
  if (!table) throw new Error("没有表格");
  return tableAt(source, table.from, table.to, pos);
}

function apply(source: string, change: TableChange | null): string {
  if (!change) return source;
  return source.slice(0, change.from) + change.insert + source.slice(change.to);
}

/** 第 n 行第 m 个单元格的偏移（n、m 从 0 开始）。 */
function cellPos(source: string, row: number, col: number): number {
  const lines = source.split("\n");
  let offset = 0;
  for (let i = 0; i < row; i += 1) offset += (lines[i] ?? "").length + 1;
  const line = lines[row] ?? "";
  let pipes = 0;
  for (let i = 0; i < line.length; i += 1) {
    if (line[i] === "|") {
      pipes += 1;
      if (pipes === col + 1) return offset + i + 2;
    }
  }
  return offset;
}

describe("tableAt", () => {
  it("找出光标所在的行与列", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 1));
    expect(at).not.toBeNull();
    expect(at!.rowIndex).toBe(2);
    expect(at!.colIndex).toBe(1);
    expect(at!.cols).toBe(3);
  });

  it("表头行是第 0 行", () => {
    expect(target(SOURCE, cellPos(SOURCE, 0, 2))!.rowIndex).toBe(0);
  });

  it("光标不在表格内时返回 null", () => {
    const tree = writaraParser.parse(SOURCE);
    let from = 0;
    let to = 0;
    tree.iterate({ enter: (node) => { if (node.name === "Table") { from = node.from; to = node.to; } } });
    expect(tableAt(SOURCE, from, to, to + 2)).toBeNull();
  });

  it("转义的竖线不计入列号", () => {
    expect(columnAt("| a\\|b | c |", 6)).toBe(0);
    expect(columnAt("| a | c |", 3)).toBe(0);
    expect(columnAt("| a | c |", 7)).toBe(1);
  });
});

describe("表格编辑", () => {
  it("在下方插入一行", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 0))!;
    const next = apply(SOURCE, insertRow(at, "below"));
    expect(next.split("\n")).toHaveLength(5);
    expect(next.split("\n")[3]).toBe("|  |  |  |");
    // 原来的第二行被推到第三行之后
    expect(next.split("\n")[4]).toBe("| 代码 | 高亮 | 折行 |");
  });

  it("在上方插入一行（表头之上不允许）", () => {
    const body = target(SOURCE, cellPos(SOURCE, 3, 0))!;
    expect(apply(SOURCE, insertRow(body, "above")).split("\n")[3]).toBe("|  |  |  |");

    const header = target(SOURCE, cellPos(SOURCE, 0, 0))!;
    expect(insertRow(header, "above")).toBeNull();
  });

  it("在右侧插入一列，对齐方式跟着左边那列", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 1))!;
    const next = apply(SOURCE, insertColumn(at, "right"));
    const lines = next.split("\n");
    expect(lines[0]).toBe("| 能力 | 编辑器 |  | 打印 |");
    expect(lines[1]).toBe("| :--- | :---: | :---: | ---: |");
    expect(lines[2]).toBe("| 表格 | 真表格 |  | 重复表头 |");
  });

  it("删除行：表头与分隔行不能删", () => {
    const body = target(SOURCE, cellPos(SOURCE, 3, 0))!;
    expect(apply(SOURCE, deleteRow(body)).split("\n")).toHaveLength(3);

    expect(deleteRow(target(SOURCE, cellPos(SOURCE, 0, 0))!)).toBeNull();
    expect(deleteRow(target(SOURCE, cellPos(SOURCE, 1, 0))!)).toBeNull();
  });

  it("删除列，对齐行同步删除", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 2))!;
    const lines = apply(SOURCE, deleteColumn(at)).split("\n");
    expect(lines[0]).toBe("| 能力 | 编辑器 |");
    expect(lines[1]).toBe("| :--- | :---: |");
    expect(lines[3]).toBe("| 代码 | 高亮 |");
  });

  it("只剩一列时删除列等于删掉整张表", () => {
    const single = ["| a |", "| --- |", "| 1 |"].join("\n");
    const at = target(single, 2)!;
    const change = deleteColumn(at);
    expect(change?.insert).toBe("");
    expect(apply(single, change)).toBe("");
  });

  it("设置列对齐", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 0))!;
    expect(apply(SOURCE, setColumnAlignment(at, "center")).split("\n")[1]).toBe(
      "| :---: | :---: | ---: |",
    );
    // 已经是这个值：不产生改动
    expect(setColumnAlignment(at, "left")).toBeNull();
  });

  it("删表整张表消失", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 0))!;
    expect(apply(SOURCE, deleteTable(at))).toBe("");
  });

  it("格式化把多余空格收成一个", () => {
    const messy = ["|a|b|", "|---|---|", "|   1   |  2  |"].join("\n");
    const at = target(messy, 1)!;
    expect(apply(messy, formatTable(at))).toBe(["| a | b |", "| --- | --- |", "| 1 | 2 |"].join("\n"));
  });

  it("单元格里的竖线会被重新转义", () => {
    const source = ["| a | b |", "| --- | --- |", "| x\\|y | z |"].join("\n");
    const at = target(source, cellPos(source, 2, 0))!;
    expect(apply(source, formatTable(at)).split("\n")[2]).toBe("| x\\|y | z |");
  });
});

describe("列宽", () => {
  it("最小列固定 3 个横线，其余按比例放大", () => {
    expect(weightsFromFractions([0.25, 0.5, 0.25])).toEqual([3, 6, 3]);
    expect(weightsFromFractions([1 / 3, 1 / 3, 1 / 3])).toEqual([3, 3, 3]);
    expect(weightsFromFractions([0.1, 0.8, 0.1])).toEqual([3, 24, 3]);
  });

  it("setColumnWidths 改写分隔行，保留对齐与其它行", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 0))!;
    const next = apply(SOURCE, setColumnWidths(at, [0.2, 0.5, 0.3]));
    const lines = next.split("\n");
    expect(columnWeights(lines[1] ?? "")).toEqual([3, 8, 5]);
    expect(parseAlignment(lines[1] ?? "")).toEqual(["left", "center", "right"]);
    expect(lines[0]).toBe(SOURCE.split("\n")[0]);
    expect(lines[2]).toBe(SOURCE.split("\n")[2]);
  });

  it("各列等宽时视为无显式列宽，不产生变更", () => {
    const at = target(SOURCE, cellPos(SOURCE, 2, 0))!;
    expect(setColumnWidths(at, [1 / 3, 1 / 3, 1 / 3])).toBeNull();
  });

  it("插入 / 删除列时列宽跟着走", () => {
    const sized = "| a | b |\n| --- | ------ |\n| 1 | 2 |";
    const at = target(sized, cellPos(sized, 2, 0))!;
    const next = apply(sized, insertColumn(at, "left")).split("\n");
    expect(columnWeights(next[1] ?? "")).toEqual([3, 3, 6]);

    const removed = apply(sized, deleteColumn(at)).split("\n");
    expect(columnWeights(removed[1] ?? "")).toEqual([6]);
  });
});

// markdownLanguage 与 writaraParser 解析出的表格结构一致；这里做个护栏，
// 避免哪天 GFM 表格扩展被换掉后测试悄悄失效。
describe("解析器一致性", () => {
  it("两个解析器都能识别表格", () => {
    const names: string[] = [];
    markdownLanguage.parser.parse(SOURCE).iterate({ enter: (node) => { names.push(node.name); } });
    expect(names).toContain("Table");
  });
});