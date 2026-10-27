import { describe, expect, it } from "vitest";

import { withImageWidth } from "./image-size";

describe("withImageWidth", () => {
  it("给普通图片加尺寸", () => {
    expect(withImageWidth("![a](p/x.png)", 300)).toBe("![a](p/x.png =300)");
  });

  it("替换已有尺寸，宽高一起换掉", () => {
    expect(withImageWidth("![a](p/x.png =300x200)", 420)).toBe("![a](p/x.png =420)");
  });

  it("有 title 时不改写（尺寸语法与 title 互斥）", () => {
    const raw = '![a](p/x.png "标题")';
    expect(withImageWidth(raw, 300)).toBe(raw);
  });

  it("不是图片时原样返回", () => {
    expect(withImageWidth("[a](p/x.png)", 300)).toBe("[a](p/x.png)");
  });

  it("宽度取整并保证至少 1px", () => {
    expect(withImageWidth("![a](p/x.png)", 0.4)).toBe("![a](p/x.png =1)");
    expect(withImageWidth("![a](p/x.png)", 300.6)).toBe("![a](p/x.png =301)");
  });
});
