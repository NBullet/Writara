import { describe, expect, it } from "vitest";

import { applySlop, deAiSlop, newCounts, scanSlop } from "./antislop";

const emoji = (text: string): string =>
  `${text} 得太棒了 ${
    String.fromCodePoint(0x1f525) + String.fromCodePoint(0xfe0f)
  }`;

describe("反 AI 腔规则层", () => {
  it("句首过场话：删词不伤句", () => {
    const source = "总之，这个方案可行。\n综上所述：价格与性能兼顾。\n这题不难，总之你试试。";
    const { text, counts } = deAiSlop(source);
    expect(text).toBe("这个方案可行。\n价格与性能兼顾。\n这题不难，总之你试试。");
    expect(counts.phrase).toBe(2);
  });

  it("句中过场话跟着句末标点走", () => {
    const { text, counts } = deAiSlop("耗时很长。值得注意的是，边际在收窄。");
    expect(text).toBe("耗时很长。边际在收窄。");
    expect(counts.phrase).toBe(1);
  });

  it("标题里的过场词不动（只认正文行）", () => {
    const source = "## 注意事项";
    const { text, counts } = deAiSlop(source);
    expect(text).toBe(source);
    expect(counts.phrase).toBe(0);
  });

  it("emoji 从正文清除，围栏代码原样", () => {
    const code = "```\nconsole.log('🔥 fire');\n```";
    const fenced = emoji("输出");
    const source = `${fenced}\n${code}\n${emoji("另一段")}`;
    const { text, counts } = deAiSlop(source);
    expect(text).toContain("🔥");
    expect(text).not.toMatch(/\u{1F525}\u{FE0F} 得/u);
    expect(counts.emoji).toBe(2);
  });

  it("行内代码里的 emoji 原样", () => {
    const source = "字符 `🔥` 原样保留，外部 🔥 清理";
    const { text, counts } = deAiSlop(source);
    expect(text).toContain("`🔥`");
    expect(text).not.toContain("外部 🔥");
    expect(counts.emoji).toBe(1);
  });

  it("列表腔：去掉「**短语**：」的加粗", () => {
    const source = "- **成本低**：每台省三成\n* **核心目标**? 不带冒号的列表项不动\n1. **重点**, 次要的";
    const { text, counts } = deAiSlop(source);
    expect(text).toContain("- 成本低：每台省三成");
    expect(text).toContain("* **核心目标**");
    expect(counts.bold).toBe(1);
  });

  it("非列表行首加粗不动", () => {
    const source = "**这不是列表腔**，是普通加粗。";
    const { text, counts } = deAiSlop(source);
    expect(text).toBe(source);
    expect(counts.bold).toBe(0);
  });

  it("结尾打圆场段整段删掉", () => {
    const sound = "正文到这里结束。";
    const tail = "希望这篇文档对你有帮助！";
    const { text, counts } = deAiSlop(`${sound}\n\n${tail}\n`);
    expect(text).toBe(`${sound}\n\n\n`);
    expect(counts.tail).toBe(1);
  });

  it("结尾是表格 / 列表 / 围栏就不动", () => {
    const source = "|a|b|\n|---|---|\n|1|2|";
    const { text, counts } = deAiSlop(source);
    expect(text).toBe(source);
    expect(counts.tail).toBe(0);
  });

  it("front matter 不动", () => {
    const source = "---\ntitle: 📝 记录\n---\n\n总之，内容。";
    const { text } = deAiSlop(source);
    expect(text).toContain("title: 📝 记录");
    expect(text).toContain("内容。");
    expect(text).not.toContain("总之");
  });

  it("干净的文档原样返回", () => {
    const clean = "# 标题\n\n正文一句话。";
    const result = deAiSlop(clean);
    expect(result.changed).toBe(false);
    expect(result.text).toBe(clean);
  });

  it("幂等：清两遍与清一遍结果一致", () => {
    const source = `- **第一步**：开启
${emoji("搞定")}
总之，结束。

以上就是全部内容了。`;
    const once = deAiSlop(source).text;
    expect(deAiSlop(once).changed).toBe(false);
  });
});

describe("newCounts", () => {
  it("全零起点", () => {
    expect(newCounts()).toEqual({ phrase: 0, emoji: 0, bold: 0, tail: 0 });
  });
});

describe("扫描区间（编辑器标记用）", () => {
  it("命中区间与文档偏移一致，应用后等于清洗结果", () => {
    const source = "总之，先看结论。\n\n- **要点**：保持短句\n\n希望这篇对你有帮助！";
    const hits = scanSlop(source);
    expect(hits.map((hit) => hit.kind)).toEqual(["phrase", "bold", "tail"]);
    for (const hit of hits) {
      expect(source.slice(hit.from, hit.to)).toBe(hit.text);
    }
    expect(applySlop(source, hits)).toBe(deAiSlop(source).text);
  });

  it("列表腔：标记覆盖整个短语，只删两对星号", () => {
    const source = "- **成本低**：每台省三成";
    const hits = scanSlop(source);
    expect(hits).toHaveLength(1);
    expect(source.slice(hits[0]!.from, hits[0]!.to)).toBe("**成本低**");
    expect(applySlop(source, hits)).toBe("- 成本低：每台省三成");
  });

  it("受保护区不产生命中", () => {
    const source = "```\n总之 🎉\n```\n\n正文";
    expect(scanSlop(source)).toHaveLength(0);
  });

  it("行内代码里的符号不进入命中，后面的照常", () => {
    const source = "见 `🔥` 与 🔥";
    const hits = scanSlop(source);
    expect(hits).toHaveLength(1);
    expect(source.slice(hits[0]!.from, hits[0]!.to)).toBe("🔥");
  });

  it("结尾段标记到段尾，不含末尾换行", () => {
    const source = "正文。\n\n以上就是全部内容了。\n";
    const hits = scanSlop(source);
    const tail = hits.find((hit) => hit.kind === "tail");
    expect(tail?.text).toBe("以上就是全部内容了。");
    expect(hits.some((hit) => hit.kind === "phrase")).toBe(false);
  });
});
