import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { StateField } from "@codemirror/state";

import { MathBlockWidget, MathPreviewWidget, mathHtml } from "./math-widget";
import { blockTouched } from "./focus";
import { refreshPreviewEffect } from "./refresh";
import { scanMath, type MathBlockSource, type MathScan } from "../../markdown/math-number";
import { currentSettings } from "../../storage/settings";

/**
 * `$$ … $$` 公式块。
 *
 * 解析器把它当成普通段落，这里识别出来：
 * - 阅读态：整块换成 KaTeX；
 * - 编辑态（光标在块内）：源码留在原位（围栏行弱化），块后挂实时预览 + ✓ 完成。
 *
 * 退出方式：↑/↓ 到边界、Mod-Enter、Esc、点 ✓、点别处（见 block-edit.ts）。
 */

const BLOCK_MATH = /^\$\$[\s\S]*\$\$$/;

const EDIT_LINE = Decoration.line({ class: "cm-md-math-edit" });
const FENCE_LINE = Decoration.line({ class: "cm-md-math-edit cm-md-math-fence" });

/** 光标所在的公式块（供 Mod-Enter / Esc 与 ✓ 使用）。 */
export function mathBlockAt(state: EditorState, pos: number): { from: number; to: number } | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, 1);
  while (node) {
    if (node.name === "Paragraph") {
      const raw = state.doc.sliceString(node.from, node.to).trim();
      if (BLOCK_MATH.test(raw)) return { from: node.from, to: node.to };
    }
    node = node.parent;
  }
  return null;
}

/**
 * 全文档的公式编号 / 引用，按文档对象缓存：
 * 选区变化会重建装饰，但公式没变，没必要再扫一遍（长文档每按键扫两遍很贵）。
 */
let cacheDoc: EditorState["doc"] | null = null;
let cacheNumbering: boolean | null = null;
let cacheScan: MathScan | null = null;

export function mathScanFor(state: EditorState): MathScan {
  const numbering = currentSettings().mathNumbering;
  if (cacheDoc === state.doc && cacheNumbering === numbering && cacheScan) return cacheScan;

  const blocks: MathBlockSource[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Paragraph") return;
      const raw = state.doc.sliceString(node.from, node.to).trim();
      if (!BLOCK_MATH.test(raw)) return;
      blocks.push({ from: node.from, tex: raw.slice(2, -2) });
    },
  });

  cacheScan = scanMath(blocks, { numbering });
  cacheDoc = state.doc;
  cacheNumbering = numbering;
  return cacheScan;
}

function build(state: EditorState): DecorationSet {
  const ranges: Range<Decoration>[] = [];
  const scan = mathScanFor(state);

  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name !== "Paragraph") return;
      const raw = state.doc.sliceString(node.from, node.to).trim();
      if (!BLOCK_MATH.test(raw)) return;

      const tex = scan.blocks.get(node.from) ?? raw.slice(2, -2);
      const firstLine = state.doc.lineAt(node.from).number;
      const lastLine = state.doc.lineAt(node.to).number;

      if (blockTouched(state, node.from, node.to)) {
        for (let number = firstLine; number <= lastLine; number += 1) {
          const line = state.doc.line(number);
          // `$$` 自己那一行弱化，TeX 行才是要写的地方
          const decoration = line.text.trim() === "$$" ? FENCE_LINE : EDIT_LINE;
          ranges.push(decoration.range(line.from));
        }
        ranges.push(
          Decoration.widget({
            widget: new MathPreviewWidget(tex, node.to),
            block: true,
            side: 1,
          }).range(state.doc.lineAt(node.to).to),
        );
        return;
      }

      // 渲染失败就保留源码，不要用一个空白块把内容吃掉
      if (!mathHtml(tex, true)) return;

      ranges.push(
        Decoration.replace({
          widget: new MathBlockWidget(tex, state.doc.lineAt(node.from).from),
          block: true,
        }).range(state.doc.lineAt(node.from).from, state.doc.lineAt(node.to).to),
      );
    },
  });

  return Decoration.set(ranges, true);
}

export function mathBlocks(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return build(state);
    },
    update(value, tr) {
      if (tr.docChanged || tr.selection) return build(tr.state);
      // 改偏好（公式自动编号、主题）时也要重建，否则编号要等到下一次编辑才出现。
      if (tr.effects.some((effect) => effect.is(refreshPreviewEffect))) return build(tr.state);
      return value;
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
