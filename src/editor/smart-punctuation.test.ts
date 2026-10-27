import { describe, expect, it } from "vitest";

import { smartPunctuationFor } from "./smart-punctuation";

describe("smartPunctuationFor", () => {
  it("引号按上下文开合", () => {
    expect(smartPunctuationFor('"', "", "你好")).toEqual({ removeBefore: 0, insert: "“" });
    expect(smartPunctuationFor('"', "他说 ", "你好")).toEqual({ removeBefore: 0, insert: "“" });
    expect(smartPunctuationFor('"', "你好", "，")).toEqual({ removeBefore: 0, insert: "”" });
  });

  it("英文里的单引号是撇号", () => {
    expect(smartPunctuationFor("'", "don", "t")).toEqual({ removeBefore: 0, insert: "’" });
  });

  it("两个连字符变破折号", () => {
    expect(smartPunctuationFor("-", "前文-", "")).toEqual({ removeBefore: 1, insert: "—" });
    expect(smartPunctuationFor("-", "前文", "")).toBeNull();
  });

  it("三个点变省略号", () => {
    expect(smartPunctuationFor(".", "等等..", "")).toEqual({ removeBefore: 2, insert: "…" });
    expect(smartPunctuationFor(".", "等等", "")).toBeNull();
  });

  it("普通字符不处理", () => {
    expect(smartPunctuationFor("a", "", "")).toBeNull();
  });
});
