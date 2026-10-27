import katex from "katex";

/**
 * LaTeX 公式渲染。
 *
 * 用 `output: "html"`：导出的 HTML 里不需要 MathML 的标签白名单，
 * 打印时由 KaTeX 自带 CSS 控制排版（字体在单文件导出中会回退）。
 */
export function renderMathHtml(tex: string, display: boolean): string | null {
  const source = tex.trim();
  if (!source) return null;
  try {
    return katex.renderToString(source, {
      displayMode: display,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    return null;
  }
}
