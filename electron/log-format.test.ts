import { describe, expect, it } from "vitest";

import { describeError, formatLogLine } from "./log-format";

describe("formatLogLine", () => {
  it("带 UTC 时间、作用域与正文", () => {
    expect(formatLogLine("main", "启动", new Date("2026-11-03T03:00:00.000Z"))).toBe(
      "2026-11-03T03:00:00.000Z [main] 启动",
    );
  });
});

describe("describeError", () => {
  it("Error 保留 name / message / stack", () => {
    const error = new TypeError("坏了");
    const text = describeError(error);
    expect(text).toContain("TypeError: 坏了");
    expect(text).toContain("TypeError");
  });

  it("普通值原样输出", () => {
    expect(describeError("出错了")).toBe("出错了");
    expect(describeError({ code: 1 })).toBe('{"code":1}');
  });

  it("循环对象不会抛异常", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(typeof describeError(value)).toBe("string");
  });
});
