// @vitest-environment jsdom
import { EditorState, Text, type StateField, type TransactionSpec } from "@codemirror/state";
import { describe, expect, it } from "vitest";

import { findSvgBlocks, svgBlocks, type SvgFieldValue } from "./svg-blocks";

const doc = (source: string) => Text.of(source.split("\n"));

function benchState(source: string) {
  const field = svgBlocks() as StateField<SvgFieldValue>;
  // 默认把光标放在文末，避免落在第一行把块当成「正在编辑」。
  let state = EditorState.create({
    doc: source,
    selection: { anchor: source.length },
    extensions: [field],
  });
  return {
    apply(spec: TransactionSpec) {
      state = state.update(spec).state;
    },
    value() {
      return state.field(field);
    },
    get length() {
      return state.doc.length;
    },
  };
}

describe("findSvgBlocks", () => {
  it("多行 svg 合成一个整行区间", () => {
    const source = '上文\n\n<svg viewBox="0 0 10 10">\n  <circle r="4"/>\n</svg>\n\n下文';
    const blocks = findSvgBlocks(doc(source));
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(source.slice(block.from, block.to)).toContain("<circle");
    expect(source.slice(block.from, block.to)).toContain("</svg>");
    expect(block.source.startsWith("<svg")).toBe(true);
  });

  it("单行 svg 也能识别", () => {
    const blocks = findSvgBlocks(doc('<svg width="8" height="8"><rect/></svg>'));
    expect(blocks).toHaveLength(1);
    expect(blocks[0]!.source).toContain("<rect/>");
  });

  it("围栏代码块里的 svg 不当作图形", () => {
    expect(findSvgBlocks(doc('```html\n<svg><circle r="1"/></svg>\n```'))).toEqual([]);
  });

  it("没有闭合标签不算", () => {
    expect(findSvgBlocks(doc('<svg viewBox="0 0 10 10">\n<circle r="4"/>'))).toEqual([]);
  });

  it("正文里没有 svg 时返回空", () => {
    expect(findSvgBlocks(doc("# 标题\n\n正文"))).toEqual([]);
  });

  it("缩进四格的行按代码处理", () => {
    expect(findSvgBlocks(doc('    <svg><rect/></svg>'))).toEqual([]);
  });
});

describe("svgBlocks 字段", () => {
  it("初始化时把独立 svg 换成图形", () => {
    const state = benchState('<svg width="8" height="8"><rect/></svg>\n\n正文');
    expect(state.value().decorations.size).toBe(1);
  });

  it("光标进入该块时退回源码，移出后恢复", () => {
    const state = benchState('<svg width="8" height="8"><rect/></svg>\n\n正文');
    expect(state.value().decorations.size).toBe(1);

    state.apply({ selection: { anchor: 3 } });
    // 编辑态：整行样式（1）+ 块后预览面板（1），不再有整块 replace
    expect(state.value().decorations.size).toBe(2);

    state.apply({ selection: { anchor: state.length } });
    expect(state.value().decorations.size).toBe(1);
  });

  it("删掉围栏后，原本在代码块里的 svg 会重新渲染", () => {
    const state = benchState('```\n<svg width="8" height="8"><rect/></svg>\n```');
    expect(state.value().decorations.size).toBe(0);

    // 删除第一行围栏（``` + 换行）
    state.apply({ changes: { from: 0, to: 4 } });
    expect(state.value().decorations.size).toBe(1);
  });

  it("没有 svg 的文档编辑不产生装饰", () => {
    const state = benchState("# 标题\n\n普通段落");
    state.apply({ changes: { from: 8, insert: "追加" } });
    expect(state.value().decorations.size).toBe(0);
    expect(state.value().hasSvg).toBe(false);
  });
});
