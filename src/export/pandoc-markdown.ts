/**
 * Markdown → 给 Pandoc 的 Markdown。
 *
 * 为什么不再走 HTML：Pandoc 的 HTML reader 只读结构，`<style>` 与 class 全丢，
 * 于是字体、首行缩进、代码配色、公式都会变形（代码块只剩一条纯文本 run）。
 * 直接把原文交给 Pandoc，再配一份参考模板，Word 里才有真样式、真语法高亮与原生公式。
 *
 * 这里只做「Pandoc 不认识、或需要借浏览器能力」的几件事：
 * - Mermaid 围栏 → PNG（渲染需要 DOM）
 * - 独立 `<svg>` 块 → PNG（Word 不认 SVG）
 * - `=宽x高` / `<img width>` → Pandoc 的 `{width=…px}`
 * - `[TOC]` → `--toc`；`<!-- pagebreak -->` → 原生分页
 * - Front Matter 去掉（标题改由 metadata 传，避免正文里再出现一遍）
 *
 * 其余语法（标题、列表、表格、脚注、任务列表、公式）原样交给 Pandoc。
 */

import { parseFrontMatter } from "../markdown/frontmatter";
import { resolveImage } from "../io/image-resolver";
import { renderMermaidSvg } from "./mermaid";
import { svgMarkupToPng } from "./svg-raster";
import { isDarkPalette } from "./theme-vars";

/** 版心宽度上限（px @96dpi）。各模板版心 14.6–15.6cm，留出余量。 */
export const DOCX_IMAGE_MAX_WIDTH = 520;

export interface PandocMarkdownOptions {
  maxImageWidth?: number;
  /** Mermaid 配色；Word 的纸是白的，默认用浅色。 */
  dark?: boolean;
}

export interface PandocMarkdown {
  markdown: string;
  toc: boolean;
}

const FENCE = /^\s*(`{3,}|~{3,})\s*([^\s`]*)/;
const TOC_LINE = /^\s*\[TOC\]\s*$/i;
const PAGE_BREAK = /^\s*<!--\s*pagebreak\s*-->\s*$/i;
const SIZED_IMAGE = /!\[([^\]]*)\]\(\s*(<[^>\s]+>|[^)\s]+)\s+=\s*(?:(\d+)\s*x\s*(\d+)|(\d+)x?)\s*\)/g;
const PLAIN_IMAGE = /!\[([^\]]*)\]\(\s*(<[^>\s]+>|[^)\s]+)(\s+"[^"]*")?\s*\)/g;
const IMG_TAG = /<img\b([^>]*)>/gi;

const PAGE_BREAK_OPENXML = [
  "```{=openxml}",
  '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
  "```",
].join("\n");

/** 行内代码里的内容不是图片、也不是换行指令，先切出去。 */
function outsideCode(line: string, rewrite: (part: string) => string): string {
  return line
    .split(/(`+[^`]*`+)/g)
    .map((part, index) => (index % 2 === 1 ? part : rewrite(part)))
    .join("");
}

function attr(name: string, tag: string): string {
  const match = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, "i").exec(tag);
  return (match?.[2] ?? match?.[3] ?? match?.[4] ?? "").trim();
}

/** `<img>` 的 width 可能是 `320`、`320px`、`50%`。 */
function widthOfAttribute(raw: string, maxWidth: number): number | undefined {
  if (!raw) return undefined;
  const percent = /^(\d+(?:\.\d+)?)%$/.exec(raw);
  if (percent) return Math.round((Number(percent[1]) / 100) * maxWidth);
  const pixels = parseFloat(raw);
  return Number.isFinite(pixels) && pixels > 0 ? Math.round(pixels) : undefined;
}

/** 图片尺寸属性；超过版心按比例缩，避免 Word 里图片直接压到页面外。 */
function sizeAttrs(width?: number, height?: number, maxWidth = DOCX_IMAGE_MAX_WIDTH): string {
  if (!width) return "";
  let w = Math.round(width);
  let h = height ? Math.round(height) : undefined;
  if (w > maxWidth) {
    if (h) h = Math.round((h * maxWidth) / w);
    w = maxWidth;
  }
  return `{width=${w}px${h ? ` height=${h}px` : ""}}`;
}

/** 粘贴进来的图片 alt 常是文件名，别让它变成 Word 里的图注。 */
function cleanAlt(alt: string): string {
  const value = alt.trim();
  if (!value) return "";
  if (/\.(?:png|jpe?g|gif|webp|avif|bmp|svgz?|tiff?)$/i.test(value)) return "";
  if (/^(?:image|img|screenshot|snipaste|paste|截图|粘贴|未命名)[\s_-]*[\d.]*$/i.test(value)) return "";
  return value;
}

function imageMarkdown(alt: string, src: string, width?: number, height?: number, maxWidth?: number): string {
  const target = /^<.*>$/.test(src) ? src : /[\s()]/.test(src) ? `<${src}>` : src;
  return `![${cleanAlt(alt)}](${target})${sizeAttrs(width, height, maxWidth)}`;
}

/** 只替换「图片单独成段」的宽高，别动行内图片。 */
function rewriteImages(line: string, widths: Map<string, number>, maxWidth: number): string {
  return outsideCode(line, (part) => {
    let next = part.replace(SIZED_IMAGE, (_whole, alt: string, src: string, w?: string, h?: string, w2?: string) => {
      const width = Number(w ?? w2 ?? 0) || undefined;
      const height = Number(h ?? 0) || undefined;
      return imageMarkdown(String(alt), String(src), width, height, maxWidth);
    });

    next = next.replace(PLAIN_IMAGE, (_whole, alt: string, src: string, title?: string) => {
      const key = String(src);
      const width = widths.get(key);
      if (!width || width <= maxWidth) return _whole;
      const target = /^<.*>$/.test(key) ? key : /[\s()]/.test(key) ? `<${key}>` : key;
      return `![${cleanAlt(String(alt))}](${target}${title ?? ""}){width=${maxWidth}px}`;
    });

    return next.replace(IMG_TAG, (_whole, tag: string) => {
      const src = attr("src", tag);
      if (!src) return "";
      const alt = attr("alt", tag);
      const width = widthOfAttribute(attr("width", tag), maxWidth);
      const height = Number(attr("height", tag).replace(/px$/i, "")) || undefined;
      return imageMarkdown(alt, src, width, height, maxWidth);
    });
  });
}

/**
 * 同步变换：围栏外的行做本地改写。Mermaid / SVG 已经在前面换成图片，
 * 所以这里只要按行处理即可；围栏内容原样保留（代码里的 `[TOC]` 不是目录）。
 *
 * `widths` 是「原图宽度」缓存，用来只给过宽的图片补宽度属性。
 */
export function rewriteMarkdown(
  source: string,
  options: { widths?: Map<string, number>; maxWidth?: number } = {},
): PandocMarkdown {
  const widths = options.widths ?? new Map<string, number>();
  const maxWidth = options.maxWidth ?? DOCX_IMAGE_MAX_WIDTH;
  const lines = source.split("\n");
  const out: string[] = [];
  let toc = false;
  let fence: string | null = null;

  for (const line of lines) {
    const opening: RegExpExecArray | null = fence ? null : FENCE.exec(line);
    if (opening) {
      fence = opening[1]!;
      out.push(line);
      continue;
    }
    if (fence) {
      out.push(line);
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }

    if (TOC_LINE.test(line)) {
      toc = true;
      continue;
    }
    if (PAGE_BREAK.test(line)) {
      out.push(PAGE_BREAK_OPENXML);
      continue;
    }

    const withBreaks = outsideCode(line, (part) => part.replace(/<br\s*\/?>/gi, () => "\\\n"));
    for (const part of withBreaks.split("\n")) {
      out.push(rewriteImages(part, widths, maxWidth));
    }
  }

  return { markdown: out.join("\n"), toc };
}

/** 找围栏外的「不带尺寸」图片，稍后量原图宽度。 */
function plainImageSources(source: string): string[] {
  const found = new Set<string>();
  let fence: string | null = null;

  for (const line of source.split("\n")) {
    const opening: RegExpExecArray | null = fence ? null : FENCE.exec(line);
    if (opening) {
      fence = opening[1]!;
      continue;
    }
    if (fence) {
      if (line.trimStart().startsWith(fence)) fence = null;
      continue;
    }
    outsideCode(line, (part) => {
      for (const match of part.matchAll(new RegExp(PLAIN_IMAGE.source, "g"))) {
        const src = String(match[2] ?? "");
        if (!/^data:/i.test(src)) found.add(src);
      }
      return part;
    });
  }

  return [...found];
}

function naturalWidth(url: string): Promise<number | null> {
  return new Promise((resolve) => {
    const image = new Image();
    const done = (value: number | null) => {
      window.clearTimeout(timer);
      resolve(value);
    };
    // 远程图片可能既不 load 也不 error，别让导出卡住
    const timer = window.setTimeout(() => done(null), 3000);
    image.onload = () => done(image.naturalWidth || null);
    image.onerror = () => done(null);
    image.src = url;
  });
}

async function loadableUrl(src: string): Promise<string | null> {
  if (/^(?:data:|blob:|https?:|app:|file:)/i.test(src)) return src;
  const pending = resolveImage(src);
  return pending ? pending : null;
}

async function measureImages(source: string): Promise<Map<string, number>> {
  const widths = new Map<string, number>();
  for (const src of plainImageSources(source)) {
    const url = await loadableUrl(src);
    if (!url) continue;
    const width = await naturalWidth(url);
    if (width) widths.set(src, width);
  }
  return widths;
}

/**
 * 把 Mermaid 围栏与独立 `<svg>` 块换成 PNG 图片，其余内容原样返回。
 * 渲染失败时保留原文（代码块至少还能看出内容，不能凭空删掉）。
 */
async function replaceRichBlocks(source: string, dark: boolean): Promise<string> {
  const lines = source.split("\n");
  const out: string[] = [];
  let fence: string | null = null;
  let fenceLang = "";
  let collected: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (fence) {
      if (line.trimStart().startsWith(fence)) {
        if (fenceLang === "mermaid") {
          const png = await mermaidPng(collected.join("\n"), dark);
          out.push(png ?? [fence, ...collected, line].join("\n"));
        } else {
          out.push([fence, ...collected, line].join("\n"));
        }
        fence = null;
        fenceLang = "";
        collected = [];
        continue;
      }
      collected.push(line);
      continue;
    }

    const opening = FENCE.exec(line);
    if (opening) {
      fence = opening[1]!;
      fenceLang = opening[2]!.toLowerCase();
      collected = [];
      continue;
    }

    if (!line.includes("<svg")) {
      out.push(line);
      continue;
    }

    // 独立 SVG 块：从 `<svg` 开始收集到 `</svg>`（可能跨行）
    let block = line;
    while (!/<\/svg\s*>/i.test(block) && index + 1 < lines.length) {
      index += 1;
      block += `\n${lines[index]!}`;
    }
    const png = await svgBlockPng(block);
    out.push(png ?? block);
  }

  return out.join("\n");
}

async function mermaidPng(source: string, dark: boolean): Promise<string | null> {
  if (!source.trim()) return null;
  const svg = await renderMermaidSvg(source, dark);
  if (!svg) return null;
  const raster = await svgMarkupToPng(svg);
  if (!raster) return null;
  return `![](${raster.src})${sizeAttrs(raster.width, undefined)}`;
}

async function svgBlockPng(block: string): Promise<string | null> {
  const match = /<svg\b[\s\S]*?<\/svg\s*>/i.exec(block);
  if (!match) return null;
  const raster = await svgMarkupToPng(match[0]);
  if (!raster) return null;
  const replaced = block.replace(match[0], `![](${raster.src})${sizeAttrs(raster.width, undefined)}`);
  return replaced.trim();
}

/** 完整流程：去掉 Front Matter → 换图表/SVG → 量图 → 改写成 Pandoc Markdown。 */
export async function preparePandocMarkdown(
  source: string,
  options: PandocMarkdownOptions = {},
): Promise<PandocMarkdown> {
  const body = parseFrontMatter(source)?.body ?? source;
  const maxWidth = options.maxImageWidth ?? DOCX_IMAGE_MAX_WIDTH;

  // Word 的纸永远是白的：暗色主题下临时套一个浅色主题再渲染 Mermaid，
  // 否则图里会是深底浅字，贴到白纸上像一块墨。
  const root = typeof document === "undefined" ? null : document.documentElement;
  const previous = root?.dataset.style;
  if (root && isDarkPalette(root)) root.dataset.style = "github";

  let withRich: string;
  try {
    withRich = await replaceRichBlocks(body, options.dark ?? false);
  } finally {
    if (root) {
      if (previous) root.dataset.style = previous;
      else delete root.dataset.style;
    }
  }

  const widths = await measureImages(withRich);
  return rewriteMarkdown(withRich, { widths, maxWidth });
}
