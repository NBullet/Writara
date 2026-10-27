import { documentTitle, renderMarkdown } from "../markdown/render";
import { currentSettings } from "../storage/settings";
import { highlightCodeBlocks } from "./highlight";
import { KATEX_CSS, inlineKatexFonts } from "./katexCss";
import { renderMermaidBlocks } from "./mermaid";
import { PX_PER_MM, resolveLayout, resolvePage, type PageSettings, type ResolvedPage } from "./page";
import { downloadPng } from "./png";
import { PRINT_CSS } from "./printStyles";
import { resolveHtmlImages, type ImageResolve } from "./resolve-images";
import { isDarkPalette, themeCss } from "./theme-vars";

/**
 * 打印 / 导出。
 *
 * 关键点：绝不直接打印编辑器 DOM。CodeMirror 只渲染视口内的行，
 * 直接 Ctrl+P 只会打出看得见的那一屏。这里改成「渲染成静态 HTML → 打印」，
 * 这也是 Typora 打印 PDF 的做法。
 */

const HOST_ID = "wr-print-host";
const STYLE_ID = "wr-print-styles";
const PAGE_STYLE_ID = "wr-page-settings";

/** 当前纸张设置；由 configurePrint 更新。 */
let page: ResolvedPage = resolvePage({ paper: "a4", margin: "normal" });

/** @page + 正文栏宽/字号：所有出口（打印、PDF、导出 HTML）都用这一份。 */
let layout = resolveLayout(page, 17, 42);
let pageCss = `${page.css}\n${layout.css}`;

/** 自定义 CSS（设置里导入的），导出时一并内联。 */
let customCss = "";

export function setCustomCss(css: string): void {
  customCss = css.replace(/<\/style/gi, "");
}

/** 切换纸张/页边距/字号/栏宽。样式放在 head 末尾，覆盖 PRINT_CSS 里的默认值。 */
export function configurePrint(settings: PageSettings & { fontSize?: number; measure?: number }): void {
  page = resolvePage(settings);
  layout = resolveLayout(page, settings.fontSize ?? 17, settings.measure ?? 42);
  pageCss = `${page.css}\n${layout.css}`;
  if (typeof document === "undefined") return;

  let style = document.getElementById(PAGE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = PAGE_STYLE_ID;
  }
  style.textContent = pageCss;
  document.head.appendChild(style);
}

/** A4 去掉 @page 上下边距后的正文高度（默认值；configurePrint 会覆盖）。 */
const MM_TO_PX = 96 / 25.4;

/** 上一次渲染进打印区的内容来源，用来判断是否需要重渲染。 */
let preparedSource: string | null = null;

/**
 * 比一页还高的块（长代码、长表格、标题+长代码的组合）不该再坚持整块不拆，
 * 否则整块被推到下一页，上一页留下大片空白。
 * 这里在打印前量一次，给它们打上可拆分的标记。
 */
export function markSplittable(
  host: HTMLElement,
  pageHeightPx = page.contentHeightMm * MM_TO_PX,
): void {
  const blocks = host.querySelectorAll("pre, table, blockquote, figure, .wr-keep");
  for (const block of Array.from(blocks)) {
    block.classList.remove("wr-split");
    if (block.getBoundingClientRect().height > pageHeightPx) block.classList.add("wr-split");
  }
}

/** 把打印样式挂到当前页面（幂等）；导出时改为内联进单文件 HTML。 */
export function installPrintStyles(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = PRINT_CSS;
  document.head.appendChild(style);
}

function escapeTitle(title: string): string {
  return title.replace(/[&<>"]/g, (char) => {
    switch (char) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      default:
        return "&quot;";
    }
  });
}

/** 导出用的主题：`current` 跟随编辑器，否则临时套用另一个 `data-style` 取值。 */
function exportTheme(style: string): { css: string; dark: boolean } {
  if (!style || style === "current") {
    return { css: themeCss(), dark: isDarkPalette() };
  }

  const root = document.documentElement;
  const previous = root.dataset.style;
  root.dataset.style = style;
  const css = themeCss(root);
  const dark = isDarkPalette(root);
  if (previous) root.dataset.style = previous;
  else delete root.dataset.style;

  return { css, dark };
}

/** 正文 HTML（已清洗）。 */
export function articleHtml(source: string): string {
  const settings = currentSettings();
  return `<article class="wr-doc">\n${renderMarkdown(source, {
    mathNumbering: settings.mathNumbering,
  })}</article>`;
}

/**
 * 打印/导出用的完整文章：代码高亮 + Mermaid + 相对路径图片解析。
 * 编辑器预览、打印预览页、打印与导出都走这一条，保证三处一致。
 */
export async function renderArticle(
  source: string,
  dark = isDarkPalette(),
  resolve?: ImageResolve,
): Promise<string> {
  try {
    const article = articleHtml(source);
    const mermaid = await renderMermaidBlocks(await highlightCodeBlocks(article), dark);
    return await resolveHtmlImages(mermaid, resolve);
  } catch {
    return articleHtml(source);
  }
}

function ensurePrintHost(): HTMLElement {
  const existing = document.getElementById(HOST_ID);
  if (existing) return existing;
  const host = document.createElement("div");
  host.id = HOST_ID;
  host.className = "wr-print-host";
  document.body.appendChild(host);
  return host;
}

function setPrintHtml(source: string, html: string): void {
  installPrintStyles();
  const host = ensurePrintHost();
  host.innerHTML = html;
  preparedSource = source;

  // 只有屏幕布局存在时才能测量；量完立刻恢复隐藏。
  host.classList.add("wr-measure");
  markSplittable(host);
  host.classList.remove("wr-measure");
}

/** 只更新打印区，不弹出打印对话框（beforeprint 里用来兜底）。 */
export function updatePrintView(source: string): void {
  setPrintHtml(source, articleHtml(source));
}

/** 打印区是否已经是这份文档（且带高亮）的内容。 */
export function isPrintPrepared(source: string): boolean {
  return preparedSource === source;
}

/** 提前把打印区渲染好（含高亮与 Mermaid），供浏览器菜单打印使用。 */
export async function preparePrintView(source: string): Promise<void> {
  if (preparedSource === source) return;
  setPrintHtml(source, await renderArticle(source));
}

/** 导出 PNG：按 A4 版面把打印区截成一张长图。 */
export async function exportPng(source: string, fileName: string): Promise<void> {
  setPrintHtml(source, await renderArticle(source));
  await downloadPng(fileName, ensurePrintHost());
}

/** 打印：先做代码高亮与 Mermaid 渲染再打印；用户取消打印对话框也不会留下脏状态。 */
export async function printMarkdown(source: string): Promise<void> {
  await preparePrintView(source);
  window.print();
}

/** 导出单文件 HTML：样式内联，双击即可打开，打印效果与打印预览一致。 */
export function standaloneHtml(source: string, title: string): string {
  return buildDocument(articleHtml(source), title);
}

/** 导出时把 KaTeX 字体也内联进去；失败就退回系统字体。 */
async function katexFontOverrides(): Promise<string> {
  try {
    const fonts = await import("./katexFonts");
    return inlineKatexFonts(KATEX_CSS, fonts.KATEX_FONT_URLS);
  } catch {
    return "";
  }
}

/** 项目导出要在多处复用同一份字体覆盖，避免每章各加载一次。 */
export async function katexOverrideCss(): Promise<string> {
  return katexFontOverrides();
}

function buildDocument(
  bodyHtml: string,
  title: string,
  extraCss = "",
  theme = themeCss(),
  dark = isDarkPalette(),
): string {
  const safeTitle = escapeTitle(title);
  const backdrop = dark ? "#0b0b0b" : "#e9e5dc";
  // 屏幕上的「纸」也按当前栏宽画：栏宽比纸张窄时，纸跟着变窄，而不是留一圈空边。
  const [topMm, rightMm, bottomMm, leftMm] = page.margins;
  const sheetWidth = (layout.columnPx + (rightMm + leftMm) * PX_PER_MM).toFixed(1);
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<style>
${theme}
${PRINT_CSS}
${KATEX_CSS}
${customCss}
${extraCss}
${pageCss}
/* 屏幕上按当前纸张与栏宽预览，打印时交还给 @page 的页边距 */
html, body { margin: 0; padding: 0; background: ${backdrop}; }
body { padding: 24px 12px; }
.wr-doc {
  width: ${sheetWidth}px; max-width: 100%; margin: 0 auto;
  padding: ${topMm}mm ${rightMm}mm ${bottomMm}mm ${leftMm}mm;
  box-sizing: border-box; background: var(--wr-bg, #fff); color: var(--wr-text, #26221d);
  box-shadow: 0 2px 24px rgba(0,0,0,.12);
}
@media print {
  body { padding: 0; background: var(--wr-bg, #fff); }
  .wr-doc { width: auto; padding: 0; box-shadow: none; }
}
</style>
<script>
(function () {
  var LIMIT = ${(page.contentHeightMm * PX_PER_MM).toFixed(3)};
  function mark() {
    var blocks = document.querySelectorAll(".wr-doc pre, .wr-doc table, .wr-doc blockquote, .wr-doc figure, .wr-doc .wr-keep");
    for (var i = 0; i < blocks.length; i++) {
      var el = blocks[i];
      el.classList.toggle("wr-split", el.getBoundingClientRect().height > LIMIT);
    }
  }
  mark();
  window.addEventListener("beforeprint", mark);
})();
</script>
</head>
<body>
${bodyHtml}
</body>
</html>
`;
}

function htmlFileName(fileName: string): string {
  return `${fileName.replace(/\.(md|markdown|mdx|txt)$/i, "") || "未命名"}.html`;
}

/**
 * 自包含 HTML：正文渲染（代码高亮 / Mermaid / 图片解析）+ 内联样式 + KaTeX 字体。
 * 导出 HTML 与导出 PDF 共用同一份，避免两条管线出来的版面不一致。
 * `style` 为 `current` 时跟随编辑器主题，否则套用指定的主题风格。
 */
export async function exportableHtml(
  source: string,
  title: string,
  style = "current",
  options: { inlineFonts?: boolean } = {},
): Promise<string> {
  const { css, dark } = exportTheme(style);
  const body = await renderArticle(source, dark);
  // Pandoc 导出不需要内联 KaTeX 字体（会把 HTML 撑到 1.5MB 且毫无用处）。
  const fonts = options.inlineFonts === false ? "" : await katexFontOverrides();
  return buildDocument(body, title, fonts, css, dark);
}

export async function downloadHtml(
  source: string,
  fileName: string,
  title = documentTitle(source, fileName),
  style = "current",
): Promise<void> {
  const html = await exportableHtml(source, title, style);
  downloadHtmlText(html, fileName);
}

/** 下载已经生成好的单文件 HTML（项目合并导出等场景）。 */
export function downloadHtmlText(html: string, fileName: string): void {
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = htmlName(fileName);
  anchor.click();
  URL.revokeObjectURL(url);
}

function htmlName(fileName: string): string {
  return htmlFileName(fileName.replace(/\.pdf$/i, ".html"));
}

/** 导出主题（项目合并导出要先知道亮暗再逐章渲染）。 */
export function exportPalette(style = "current"): { css: string; dark: boolean } {
  return exportTheme(style);
}

/** 用已经渲染好的正文 HTML 生成单文件（项目分章导出用）。 */
export function bodyDocumentHtml(
  title: string,
  bodyHtml: string,
  style = "current",
  extraCss = "",
): string {
  const { css, dark } = exportTheme(style);
  return buildDocument(bodyHtml, title, extraCss, css, dark);
}

export interface ProjectSection {
  /** 章节锚点（目录在没有标题时用它兜底）。 */
  id: string;
  title: string;
  /** `renderArticle` 的输出（一个 `<article class="wr-doc">`）。 */
  html: string;
}

export interface ProjectTocEntry {
  id: string;
  text: string;
  level: number;
}

/**
 * 项目合并导出：多章共用一个 `.wr-doc` 版式，章节之间按需分页，
 * 目录单独占一页。图片必须已经逐章解析过（这里不再碰路径）。
 */
export function projectDocumentHtml(options: {
  title: string;
  sections: ProjectSection[];
  toc: ProjectTocEntry[];
  chapterBreak: boolean;
  style?: string;
  /** 已加载的 KaTeX 字体覆盖（多章共用）。 */
  extraCss?: string;
}): string {
  const { css, dark } = exportTheme(options.style ?? "current");
  const toc = options.toc.length
    ? `<nav class="wr-doc wr-project-toc"><h1>${escapeTitle(options.title)}</h1><ol class="wr-project-toc-list">${options.toc
        .map(
          (entry) =>
            `<li class="wr-toc-lv${entry.level}"><a href="#${escapeTitle(entry.id)}">${escapeTitle(entry.text)}</a></li>`,
        )
        .join("")}</ol></nav>\n`
    : "";
  const sections = options.sections
    .map(
      (section) =>
        `<section class="wr-project-chapter" id="${escapeTitle(section.id)}">${section.html}</section>`,
    )
    .join("\n");
  const extraCss = `${options.extraCss ?? ""}
.wr-project-chapter + .wr-project-chapter { margin-top: 28px; }
.wr-project-toc-list { margin: 1.2em 0 0; padding: 0; list-style: none; }
.wr-project-toc-list li { margin: .45em 0; }
.wr-project-toc-list .wr-toc-lv2 { padding-left: 1.6em; font-size: .95em; }
.wr-project-toc-list a { color: inherit; text-decoration: none; }
.wr-project-toc-list a:hover { text-decoration: underline; }
@media print {
  .wr-project-toc { break-after: page; }
  .wr-project-chapter + .wr-project-chapter { margin-top: 0; }
  ${options.chapterBreak ? ".wr-project-chapter + .wr-project-chapter { break-before: page; }" : ""}
}`;
  return buildDocument(`${toc}${sections}`, options.title, extraCss, css, dark);
}
