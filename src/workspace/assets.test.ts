import { describe, expect, it } from "vitest";

import { assetKindOf, extensionOf } from "./assets";

describe("assetKindOf", () => {
  it("图片 / 附件 / 其它三类", () => {
    expect(assetKindOf("封面.PNG")).toBe("image");
    expect(assetKindOf("报告.pdf")).toBe("attachment");
    expect(assetKindOf("数据.unknownext")).toBe("other");
  });

  it("没有扩展名归到其它", () => {
    expect(extensionOf("README")).toBe("");
    expect(assetKindOf("README")).toBe("other");
  });
});
