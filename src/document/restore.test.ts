import { describe, expect, it } from "vitest";

import { decideRestore } from "./restore";

describe("decideRestore", () => {
  it("没有草稿时采用磁盘内容", () => {
    const decision = decideRestore({ draft: "", hadDraft: false, recordText: "旧", disk: "磁盘内容" });
    expect(decision).toEqual({ text: "磁盘内容", savedText: "磁盘内容", notice: null });
  });

  it("草稿与上次保存一致时采用磁盘内容", () => {
    const decision = decideRestore({ draft: "旧", hadDraft: true, recordText: "旧", disk: "磁盘内容" });
    expect(decision.text).toBe("磁盘内容");
    expect(decision.notice).toBeNull();
  });

  it("草稿更新时保留草稿，不覆盖用户没保存的东西", () => {
    const decision = decideRestore({ draft: "草稿新内容", hadDraft: true, recordText: "旧", disk: "旧" });
    expect(decision).toEqual({ text: "草稿新内容", savedText: "旧", notice: null });
  });

  it("磁盘被外部改过时保留草稿并提示冲突", () => {
    const decision = decideRestore({
      draft: "草稿新内容",
      hadDraft: true,
      recordText: "旧",
      disk: "别人改过",
    });
    expect(decision.text).toBe("草稿新内容");
    expect(decision.notice).toContain("磁盘上的文件已被修改");
  });

  it("读不到磁盘（权限/文件消失）时保留草稿并提示重新授权", () => {
    const decision = decideRestore({ draft: "草稿", hadDraft: true, recordText: "旧", disk: null });
    expect(decision.text).toBe("草稿");
    expect(decision.notice).toContain("重新授权");
  });
});
