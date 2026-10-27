/**
 * 块级公式的编号与交叉引用。
 *
 * 编辑器（`live-preview/math-blocks.ts`）与打印（`markdown/render.ts`）共用这一份：
 * 同一份文档里第 n 个公式在屏幕上和 PDF 里必须是同一个号，`\eqref` 也要指向同一个号。
 *
 * 约定（与 Typora 一致）：
 * - 只有 `$$ … $$` 这种独占段落的公式参与编号，行内 `$…$` 不算；
 * - 自己写了 `\tag{…}` 的公式保持原样，也不占用序号；
 * - `\label{名字}` 给公式起名，`\eqref{名字}` 渲染成 `(n)`、`\ref{名字}` 渲染成 `n`；
 *   找不到的引用显示 `??`（与 LaTeX 一致，不静默吞掉）；
 * - 编号靠 KaTeX 的 `\tag` 实现，显示在公式右侧的括号里。
 */

export interface MathBlockSource {
  /** 公式块在文档里的起始位置（段落起点，用来做键）。 */
  from: number;
  tex: string;
}

export interface MathScan {
  /** 每个公式块最终要渲染的 TeX（含编号与已替换的引用）。 */
  blocks: Map<number, string>;
  /** 行内公式：只需要替换引用，不编号。 */
  inline: (tex: string) => string;
  /** 标签 → 编号文本（`1` / `A`），没有编号的公式不会出现在这里。 */
  labels: Map<string, string>;
}

/** 公式里是否已经有手写编号（`\tag{1}` / `\tag*{1}`）。 */
export function hasEquationTag(tex: string): boolean {
  return /\\tag\*?\{/.test(tex);
}

/** 给块级公式追加 `\tag{n}`；已有手写编号时原样返回。 */
export function numberedMath(tex: string, number: number): string {
  if (hasEquationTag(tex)) return tex;
  return `${tex.trimEnd()}\n\\tag{${number}}`;
}

const TAG = /\\tag\*?\{([^}]*)\}/;
const LABEL_SOURCE = "\\\\label\\{[^}]*\\}";
const EQREF = /\\eqref\{([^}]*)\}/g;
const REF = /\\ref\{([^}]*)\}/g;

/** 手写 `\tag{A}` 的值；没有时返回空字符串。 */
export function equationTagOf(tex: string): string {
  return TAG.exec(tex)?.[1]?.trim() ?? "";
}

/** 公式里声明的标签。 */
export function equationLabels(tex: string): string[] {
  return [...tex.matchAll(new RegExp("\\\\label\\{([^}]*)\\}", "g"))]
    .map((match) => (match[1] ?? "").trim())
    .filter(Boolean);
}

/** KaTeX 不认识 `\label`：判定完必须从渲染用的 TeX 里删掉，否则会当成普通文本印出来。 */
function stripLabels(tex: string): string {
  return tex.replace(new RegExp(LABEL_SOURCE, "g"), "").replace(/[ \t]+$/gm, "");
}

/**
 * 扫描全文：先按出现顺序编号并收集标签，再替换所有引用。
 * 顺序很关键 —— 引用可以出现在被引用公式之前（前向引用）。
 */
export function scanMath(blocks: MathBlockSource[], options: { numbering: boolean }): MathScan {
  const labels = new Map<string, string>();
  const assigned = new Map<number, string>();
  let counter = 0;

  for (const block of blocks) {
    const tag = equationTagOf(block.tex);
    let text = tag;
    if (!text && options.numbering) {
      counter += 1;
      text = String(counter);
    }
    if (text) assigned.set(block.from, text);
    for (const label of equationLabels(block.tex)) {
      if (text) labels.set(label, text);
    }
  }

  const replaceRefs = (tex: string): string =>
    tex
      .replace(EQREF, (_whole, name: string) => `(${labels.get(name.trim()) ?? "??"})`)
      .replace(REF, (_whole, name: string) => labels.get(name.trim()) ?? "??");

  const rendered = new Map<number, string>();
  for (const block of blocks) {
    const text = assigned.get(block.from);
    const clean = stripLabels(replaceRefs(block.tex));
    // 自动编号：`\tag` 由这里补；手写 tag 已在原文里，不再追加。
    rendered.set(
      block.from,
      text && !hasEquationTag(block.tex) ? numberedMath(clean, Number(text)) : clean,
    );
  }

  return { blocks: rendered, inline: (tex) => stripLabels(replaceRefs(tex)), labels };
}
