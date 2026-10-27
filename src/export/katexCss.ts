/**
 * KaTeX 样式，导出单文件 HTML 时内联进去。
 *
 * 注意：`?raw` 在 vitest 环境下会拿到空字符串（与 print.css 的老问题一致），
 * 所以这里只影响「导出的 HTML」，测试不要依赖它非空。
 * 字体由 `inlineKatexFonts` 替换为 data URL（导出时动态加载 katexFonts）。
 */
import raw from "katex/dist/katex.min.css?raw";

export const KATEX_CSS: string = raw;

/** 把 CSS 里的 `url(fonts/xxx.woff2)` 换成内联的 data URL。 */
export function inlineKatexFonts(css: string, fonts: Record<string, string>): string {
  return css.replace(/url\(\s*['"]?[^)'"]*?fonts\/([^)'"/]+\.woff2)['"]?\s*\)/g, (whole, name: string) => {
    const dataUrl = fonts[name];
    return dataUrl ? `url(${dataUrl})` : whole;
  });
}
