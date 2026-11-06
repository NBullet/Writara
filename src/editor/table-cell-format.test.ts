import { describe, expect, it } from "vitest";

import { cellFormatMarkers, toggleCellWrap } from "./table-cell-format";

describe("cellFormatMarkers", () => {
  it("常见格式命令都有标记", () => {
    expect(cellFormatMarkers("bold", "")).toEqual({ open: "**", close: "**" });
    expect(cellFormatMarkers("italic", "")).toEqual({ open: "*", close: "*" });
    expect(cellFormatMarkers("strike", "")).toEqual({ open: "~~", close: "~~" });
    expect(cellFormatMarkers("underline", "")).toEqual({ open: "<u>", close: "</u>" });
    expect(cellFormatMarkers("code", "x")).toEqual({ open: "`", close: "`" });
    expect(cellFormatMarkers("code", "a`b")).toEqual({ open: "``", close: "``" });
  });

  it("非格式命令返回 null", () => {
    expect(cellFormatMarkers("save", "")).toBeNull();
    expect(cellFormatMarkers("find", "")).toBeNull();
  });
});

describe("toggleCellWrap", () => {
  it("包裹选区并保持选中内部文字", () => {
    expect(toggleCellWrap({ value: "知识域", start: 0, end: 3 }, { open: "**", close: "**" })).toEqual({
      value: "**知识域**",
      start: 2,
      end: 5,
    });
  });

  it("选区自带标记时去掉", () => {
    expect(toggleCellWrap({ value: "**知识域**", start: 0, end: 7 }, { open: "**", close: "**" })).toEqual({
      value: "知识域",
      start: 0,
      end: 3,
    });
  });

  it("标记在选区两侧时一起去掉", () => {
    expect(toggleCellWrap({ value: "a **知识域** b", start: 4, end: 7 }, { open: "**", close: "**" })).toEqual({
      value: "a 知识域 b",
      start: 2,
      end: 5,
    });
  });

  it("空选区插入一对标记，光标停在中间", () => {
    expect(toggleCellWrap({ value: "abc", start: 3, end: 3 }, { open: "`", close: "`" })).toEqual({
      value: "abc``",
      start: 4,
      end: 4,
    });
  });

  it("下标越界时按文本长度收敛", () => {
    expect(toggleCellWrap({ value: "ab", start: -3, end: 99 }, { open: "*", close: "*" })).toEqual({
      value: "*ab*",
      start: 1,
      end: 3,
    });
  });
});
