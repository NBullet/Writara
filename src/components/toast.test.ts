import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dismissToast, getToast, showToast, subscribeToast, toast } from "./toast";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  dismissToast();
  vi.useRealTimers();
});

describe("toast", () => {
  it("成功提示 4 秒后自动消失", () => {
    toast.success("已保存");
    expect(getToast()?.message).toBe("已保存");
    vi.advanceTimersByTime(3999);
    expect(getToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getToast()).toBeNull();
  });

  it("错误提示常驻，直到手动关闭", () => {
    toast.error("无法保存");
    vi.advanceTimersByTime(60_000);
    expect(getToast()?.tone).toBe("error");
    dismissToast();
    expect(getToast()).toBeNull();
  });

  it("撤销提示给 8 秒", () => {
    toast.undo("已删除", { label: "撤销", run: () => undefined });
    vi.advanceTimersByTime(7999);
    expect(getToast()).not.toBeNull();
    vi.advanceTimersByTime(1);
    expect(getToast()).toBeNull();
  });

  it("新提示顶掉旧提示，不会堆叠", () => {
    showToast({ message: "第一条", duration: 0 });
    showToast({ message: "第二条", duration: 0 });
    expect(getToast()?.message).toBe("第二条");
  });

  it("通知订阅者", () => {
    const listener = vi.fn();
    const stop = subscribeToast(listener);
    showToast({ message: "x", duration: 0 });
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    dismissToast();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
