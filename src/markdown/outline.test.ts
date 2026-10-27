import { describe, expect, it } from "vitest";

import { collectOutline } from "./outline";

describe("collectOutline", () => {
  it("按层级收集标题与位置", () => {
    const source = "# 一\n\n正文\n\n## 二\n\n### 三";
    const outline = collectOutline(source);
    expect(outline.map((item) => `${item.level}:${item.text}`)).toEqual(["1:一", "2:二", "3:三"]);
    expect(source.slice(outline[2]!.from, outline[2]!.from + 5)).toBe("### 三");
  });

  it("去掉标题里的标记", () => {
    const outline = collectOutline("## **粗体** 与 `代码`");
    expect(outline[0]?.text).toBe("粗体 与 代码");
  });

  it("front matter 之后的标题位置要加偏移", () => {
    const source = "---\ntitle: x\n---\n\n# 标题";
    const outline = collectOutline(source);
    expect(outline[0]?.text).toBe("标题");
    expect(source.slice(outline[0]!.from, outline[0]!.from + 4)).toBe("# 标题");
  });

  it("没有标题时返回空", () => {
    expect(collectOutline("只有正文")).toEqual([]);
  });
});
