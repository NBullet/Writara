import { slugify } from "../markdown/slug";
import {
  bodyDocumentHtml,
  exportPalette,
  katexOverrideCss,
  projectDocumentHtml,
  renderArticle,
  type ProjectSection,
  type ProjectTocEntry,
} from "./print";
import type { ImageResolve } from "./resolve-images";

/**
 * 项目导出：把一章一文件的正文合成一册，或按章输出独立 HTML。
 *
 * 图片按**每章所在目录**解析（`resolveFor(path)`），不能用项目根统一解析，
 * 否则 `卷一/图.png` 会全部 404。渲染本身仍走 `renderArticle`，与单文档导出同一套管线。
 */

export interface ProjectChapterInput {
  path: string;
  /** 章标题（没有 h1 时用于目录）。 */
  title: string;
  text: string;
}

export interface ProjectRenderOptions {
  title: string;
  /** 生成目录页。 */
  toc: boolean;
  /** 章与章之间分页。 */
  chapterBreak: boolean;
  style?: string;
}

export interface RenderedChapter {
  path: string;
  title: string;
  /** 章节锚点。 */
  id: string;
  /** 已完成代码高亮 / 图表 / 图片解析的 `<article class="wr-doc">`。 */
  html: string;
}

export interface RenderedProject {
  /** 合并后的单文件 HTML。 */
  html: string;
  chapters: RenderedChapter[];
  toc: ProjectTocEntry[];
  title: string;
  /** 已经加载好的 KaTeX 字体覆盖（分章导出复用，避免每章重复加载）。 */
  fonts: string;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => {
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

/**
 * 给一章里的标题重新编号：跨章重复的锚点追加 `-2`、`-3`。
 * 章内链接仍指向首次出现的 id（已知限制，见 `docs/project-mode.md` §5）。
 */
function scopeHeadingIds(
  html: string,
  used: Set<string>,
): { html: string; headings: ProjectTocEntry[] } {
  const template = document.createElement("template");
  template.innerHTML = html;
  const headings: ProjectTocEntry[] = [];

  for (const node of Array.from(template.content.querySelectorAll("h1, h2, h3, h4, h5, h6"))) {
    const base = node.getAttribute("id") || slugify(node.textContent ?? "");
    let id = base;
    let index = 2;
    while (used.has(id)) {
      id = `${base}-${index}`;
      index += 1;
    }
    used.add(id);
    node.setAttribute("id", id);
    headings.push({
      id,
      text: (node.textContent ?? "").trim(),
      level: Number(node.tagName.slice(1)),
    });
  }

  return { html: template.innerHTML, headings };
}

export async function renderProject(
  chapters: ProjectChapterInput[],
  options: ProjectRenderOptions,
  resolveFor: (chapterPath: string) => ImageResolve | undefined,
): Promise<RenderedProject> {
  const { dark } = exportPalette(options.style ?? "current");
  const fonts = await katexOverrideCss();
  const used = new Set<string>();
  const sections: ProjectSection[] = [];
  const rendered: RenderedChapter[] = [];
  const toc: ProjectTocEntry[] = [];

  chapters.forEach((chapter, index) => {
    sections.push({ id: `chapter-${index + 1}`, title: chapter.title, html: "" });
  });

  // 逐章渲染（图片解析器不同，不能并行串错目录）。
  for (const [index, chapter] of chapters.entries()) {
    const article = await renderArticle(chapter.text, dark, resolveFor(chapter.path));
    const scoped = scopeHeadingIds(article, used);
    sections[index]!.html = scoped.html;
    rendered.push({
      path: chapter.path,
      title: chapter.title,
      id: `chapter-${index + 1}`,
      html: scoped.html,
    });

    const outline = scoped.headings.filter((entry) => entry.level <= 2);
    if (outline.length) toc.push(...outline);
    else toc.push({ id: `chapter-${index + 1}`, text: chapter.title, level: 1 });
  }

  return {
    html: projectDocumentHtml({
      title: options.title,
      sections,
      toc: options.toc ? toc : [],
      chapterBreak: options.chapterBreak,
      style: options.style,
      extraCss: fonts,
    }),
    chapters: rendered,
    toc,
    title: options.title,
    fonts,
  };
}

/** 下载 / 写盘用的章节文件名：`01-标题.html`。 */
export function chapterFileName(index: number, title: string): string {
  const safe = title
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/_+/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return `${String(index + 1).padStart(2, "0")}-${safe || "章节"}.html`;
}

/** 目录式导出的索引页（每章一个文件，链接到章节 HTML）。 */
export function bundleIndexHtml(
  title: string,
  chapters: Array<{ title: string; fileName: string }>,
  style = "current",
  extraCss = "",
): string {
  const items = chapters
    .map((chapter) => `<li><a href="${escapeHtml(chapter.fileName)}">${escapeHtml(chapter.title)}</a></li>`)
    .join("");
  const body = `<article class="wr-doc"><h1>${escapeHtml(title)}</h1><ol class="wr-project-toc-list">${items}</ol></article>`;
  return bodyDocumentHtml(title, body, style, extraCss);
}

/** 单章独立 HTML（图片已经是 data URL，可单独交付）。 */
export function chapterDocumentHtml(
  chapter: RenderedChapter,
  style = "current",
  extraCss = "",
): string {
  return bodyDocumentHtml(chapter.title, chapter.html, style, extraCss);
}
