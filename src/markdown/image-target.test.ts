import { describe, expect, it } from "vitest";

import { parseImageTarget } from "./image-target";

describe("parseImageTarget", () => {
  it("没有尺寸时原样返回", () => {
    expect(parseImageTarget("https://example.com/a.png")).toEqual({ src: "https://example.com/a.png" });
  });

  it("宽x高", () => {
    expect(parseImageTarget("a.png =320x200")).toEqual({ src: "a.png", width: 320, height: 200 });
  });

  it("只给宽度", () => {
    expect(parseImageTarget("a.png =320")).toEqual({ src: "a.png", width: 320, height: undefined });
    expect(parseImageTarget("a.png =320x")).toEqual({ src: "a.png", width: 320, height: undefined });
  });

  it("允许等号两侧有空格", () => {
    expect(parseImageTarget("a.png  =  100 x 50")).toMatchObject({ src: "a.png", width: 100, height: 50 });
  });

  it("正文里的等号不误判", () => {
    expect(parseImageTarget("https://example.com/?a=1")).toEqual({ src: "https://example.com/?a=1" });
  });
});
