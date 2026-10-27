import { afterEach, describe, expect, it } from "vitest";

import { askConfirm, registerConfirm } from "./confirm";

let dispose: (() => void) | null = null;

afterEach(() => {
  dispose?.();
  dispose = null;
});

describe("askConfirm", () => {
  it("没有挂载处理器时按取消处理", async () => {
    await expect(askConfirm({ title: "test", actions: [] })).resolves.toBeNull();
  });

  it("把请求交给已注册的处理器", async () => {
    const seen: string[] = [];
    dispose = registerConfirm(async (request) => {
      seen.push(request.title);
      return "save";
    });
    await expect(
      askConfirm({ title: "未保存", actions: [{ id: "save", label: "保存" }] }),
    ).resolves.toBe("save");
    expect(seen).toEqual(["未保存"]);
  });

  it("注销后不再命中旧处理器", async () => {
    dispose = registerConfirm(async () => "old");
    dispose();
    await expect(askConfirm({ title: "x", actions: [] })).resolves.toBeNull();
  });
});
