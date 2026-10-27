import { describe, expect, it } from "vitest";

import { slugify, uniqueSlug } from "./slug";

describe("slugify", () => {
  it("中文标题保留汉字", () => {
    expect(slugify("图形：直接写 SVG")).toBe("图形直接写-svg");
  });

  it("去掉行内标记与标点", () => {
    expect(slugify("**粗体**与`代码`")).toBe("粗体与代码");
    expect(slugify("Hello, World!")).toBe("hello-world");
  });

  it("空格折叠为连字符", () => {
    expect(slugify("  a   b  ")).toBe("a-b");
  });

  it("空标题有兜底", () => {
    expect(slugify("!!!")).toBe("section");
  });
});

describe("uniqueSlug", () => {
  it("重复标题依次加序号", () => {
    const used = new Set<string>();
    expect(uniqueSlug("标题", used)).toBe("标题");
    expect(uniqueSlug("标题", used)).toBe("标题-1");
    expect(uniqueSlug("标题", used)).toBe("标题-2");
  });
});
