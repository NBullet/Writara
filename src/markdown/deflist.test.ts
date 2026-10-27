import { describe, expect, it } from "vitest";

import { definitionMarker, parseDefinitionList } from "./deflist";

describe("parseDefinitionList", () => {
  it("术语 + 一行或多行解释", () => {
    expect(parseDefinitionList("术语\n: 解释")).toEqual({ term: "术语", details: ["解释"] });
    expect(parseDefinitionList("**术语**\n: 第一条\n: 第二条")).toEqual({
      term: "**术语**",
      details: ["第一条", "第二条"],
    });
  });

  it("不是定义列表时返回 null", () => {
    expect(parseDefinitionList("普通段落")).toBeNull();
    expect(parseDefinitionList("术语\n第二行")).toBeNull();
    expect(parseDefinitionList(": 只有解释")).toBeNull();
  });

  it("marker 长度包含缩进与冒号后的空格", () => {
    expect(definitionMarker(": 解释")).toBe(2);
    expect(definitionMarker(":   解释")).toBe(4);
    expect(definitionMarker("   : 解释")).toBe(5);
    expect(definitionMarker("不是")).toBe(0);
  });
});
