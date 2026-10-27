// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { matchCommand, type PaletteCommand } from "./command-match";

function command(partial: Partial<PaletteCommand>): PaletteCommand {
  return {
    id: "test",
    label: "保存",
    group: "command",
    run: () => undefined,
    ...partial,
  };
}

describe("matchCommand", () => {
  it("空查询保留命令本身", () => {
    const target = command({});
    expect(matchCommand(target, "  ")).toEqual({ command: target, score: 0, indices: [] });
  });

  it("标签里的子串优先，并给出高亮位置", () => {
    const match = matchCommand(command({ label: "保存文件" }), "保存");
    expect(match?.indices).toEqual([0, 1]);
    expect(match?.score).toBeGreaterThan(100);
  });

  it("路径与关键词也能命中，但不做标签高亮", () => {
    const match = matchCommand(
      command({ label: "公式块", path: "编辑 › 数学工具", keywords: "编辑 数学工具 公式块" }),
      "数学",
    );
    expect(match?.score).toBe(55);
    expect(match?.indices).toEqual([]);
  });

  it("英文支持散落的子序列", () => {
    const match = matchCommand(command({ label: "Toggle Sidebar" }), "tsb");
    expect(match?.indices).toEqual([0, 7, 11]);
  });

  it("完全不匹配时返回 null", () => {
    expect(matchCommand(command({}), "zzzz")).toBeNull();
  });
});
