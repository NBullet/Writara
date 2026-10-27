import { describe, expect, it } from "vitest";

import { hasEquationTag, numberedMath, scanMath } from "./math-number";

describe("numberedMath", () => {
  it("追加 \\tag 编号", () => {
    expect(numberedMath("a^2+b^2=c^2", 3)).toBe("a^2+b^2=c^2\n\\tag{3}");
  });

  it("末尾空白先去掉，避免多出空行", () => {
    expect(numberedMath("x = 1\n\n", 1)).toBe("x = 1\n\\tag{1}");
  });

  it("手写 \\tag 时不改动", () => {
    expect(hasEquationTag("x\n\\tag{7}")).toBe(true);
    expect(numberedMath("x\n\\tag{7}", 1)).toBe("x\n\\tag{7}");
    expect(numberedMath("x\n\\tag*{7}", 1)).toBe("x\n\\tag*{7}");
  });
});

describe("scanMath", () => {
  const blocks = [
    { from: 0, tex: "a^2 + b^2 = c^2 \\label{eq:pythagoras}" },
    { from: 100, tex: "e^{i\\pi} + 1 = 0" },
    { from: 200, tex: "x = y \\tag{A} \\label{eq:manual}" },
  ];

  it("按顺序编号，手写 \\tag 不占号", () => {
    const scan = scanMath(blocks, { numbering: true });
    expect(scan.blocks.get(0)).toContain("\\tag{1}");
    expect(scan.blocks.get(100)).toContain("\\tag{2}");
    expect(scan.blocks.get(200)).toContain("\\tag{A}");
    expect(scan.blocks.get(200)).not.toContain("\\tag{3}");
  });

  it("标签指向自己的编号（手写 tag 指向 tag 文本）", () => {
    const scan = scanMath(blocks, { numbering: true });
    expect(scan.labels.get("eq:pythagoras")).toBe("1");
    expect(scan.labels.get("eq:manual")).toBe("A");
  });

  it("\\eqref 渲染成 (n)，\\ref 渲染成 n", () => {
    const scan = scanMath(
      [{ from: 0, tex: "由 \\eqref{eq:a} 与 \\ref{eq:a} 可知" }, { from: 80, tex: "x \\label{eq:a}" }],
      { numbering: true },
    );
    expect(scan.labels.get("eq:a")).toBe("2");
    expect(scan.blocks.get(0)).toContain("由 (2) 与 2 可知");
  });

  it("前向引用能解析（引用出现在被引公式之前）", () => {
    const scan = scanMath(
      [{ from: 0, tex: "见 \\eqref{later}" }, { from: 50, tex: "y \\label{later}" }],
      { numbering: true },
    );
    expect(scan.labels.get("later")).toBe("2");
    expect(scan.blocks.get(0)).toContain("(2)");
  });

  it("未知标签显示 ??，与 LaTeX 一致", () => {
    const scan = scanMath([{ from: 0, tex: "\\eqref{missing}" }], { numbering: true });
    expect(scan.blocks.get(0)).toContain("(??)");
  });

  it("关闭编号时只保留手写 tag 与引用", () => {
    const scan = scanMath(
      [{ from: 0, tex: "\\eqref{tagged}" }, { from: 40, tex: "z \\tag{7} \\label{tagged}" }],
      { numbering: false },
    );
    expect(scan.blocks.get(0)).toBe("(7)");
    expect(scan.blocks.get(40)).not.toContain("\\tag{1}");
  });

  it("渲染用的 TeX 里不再保留 \\label（KaTeX 不认识它）", () => {
    const scan = scanMath([{ from: 0, tex: "x = 1 \\label{eq:x}" }], { numbering: true });
    expect(scan.blocks.get(0)).toBe("x = 1\n\\tag{1}");
  });

  it("行内公式只替换引用", () => {
    const scan = scanMath([{ from: 0, tex: "a \\label{eq:x}" }], { numbering: true });
    expect(scan.inline("\\eqref{eq:x} 与 b")).toBe("(1) 与 b");
  });
});
