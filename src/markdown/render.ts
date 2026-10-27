import type { SyntaxNode, Tree } from "@lezer/common";

import { emojiFor } from "./emoji";
import { parseDefinitionList, type DefinitionList } from "./deflist";
import { scanMath, type MathBlockSource, type MathScan } from "./math-number";
import { parseFrontMatter } from "./frontmatter";
import { parseImageTarget } from "./image-target";
import { replaceSizedImages } from "./image-size";
import { renderMathHtml } from "./math";
import { writaraParser } from "./parser";
import { sanitizeHtml } from "./sanitize";
import { slugify, uniqueSlug } from "./slug";
import { parseAlignment, columnPercents } from "./table";

/**
 * Markdown → HTML，用于打印 / 导出。
 * 与编辑器共用同一个 Lezer 语法树（GFM），因此「看到的」和「打出来的」是同一套解析结果。
 */

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

function esc(text: string): string {
  return text.replace(/[&<>"]/g, (char) => ESCAPES[char] ?? char);
}

/** 这些节点只是标记本身，不产生内容。 */
const MARK_NODES = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "CodeInfo",
  "LinkMark",
  "LinkTitle",
  "QuoteMark",
  "ListMark",
  "TableDelimiter",
  "TaskMarker",
  "URL",
]);

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/;

/** 引用链接的标签归一化：去掉方括号、大小写与多余空白。 */
function normalizeRef(label: string): string {
  return label.replace(/^\[|\]$/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

const ALIGN_CLASS: Record<string, string> = {
  left: "wr-align-left",
  center: "wr-align-center",
  right: "wr-align-right",
};

class HtmlRenderer {
  /** 标题锚点：渲染 TOC 与内链都需要先知道全篇标题。 */
  private readonly headings: Array<{ level: number; id: string; html: string }> = [];
  private readonly headingIdAt = new Map<number, string>();
  /** 引用链接：`[文字][ref]` → 定义表。 */
  private readonly refs = new Map<string, { url: string; title: string }>();
  /** 脚注：定义顺序决定编号。 */
  private readonly footnoteBodies = new Map<string, string>();
  private readonly footnoteOrder: string[] = [];
  private readonly footnoteNumber = new Map<string, number>();
  /** 脚注定义的续行（多行定义）在正文里对应的源码范围，渲染正文时跳过。 */
  private readonly footnoteSpans: Array<{ from: number; to: number }> = [];

  constructor(
    private readonly src: string,
    private readonly tree: Tree,
    private readonly options: RenderOptions = {},
  ) {}

  /** 已自动编号的块级公式数：只有真正写进编号的块才占号（`\tag` 手写的不算）。 */
  private math: MathScan | null = null;

  /** 全文扫一遍公式：编号与交叉引用必须一次算完（引用可以前向）。 */
  private collectMath(): void {
    const blocks: MathBlockSource[] = [];
    this.tree.iterate({
      enter: (node) => {
        if (node.name !== "Paragraph") return;
        const raw = this.src.slice(node.from, node.to).trim();
        if (!/^\$\$[\s\S]*\$\$$/.test(raw)) return;
        blocks.push({ from: node.from, tex: raw.slice(2, -2) });
      },
    });
    this.math = scanMath(blocks, { numbering: this.options.mathNumbering === true });
  }

  render(): string {
    this.collectHeadings();
    this.collectReferences();
    this.collectMath();
    return this.blocks(this.tree.topNode) + this.footnoteSection();
  }

  private collectReferences(): void {
    let counter = 0;
    this.tree.iterate({
      enter: (node) => {
        if (node.name !== "LinkReference") return;
        const label = node.node.getChild("LinkLabel");
        const url = node.node.getChild("URL");
        if (!label || !url) return;

        const key = normalizeRef(this.src.slice(label.from, label.to));
        const title = node.node.getChild("LinkTitle");
        const href = this.src.slice(url.from, url.to);

        if (key.startsWith("^")) {
          const id = key.slice(1);
          if (this.footnoteBodies.has(id)) return;
          counter += 1;
          const extended = this.extendedFootnote(href, node.node.to);
          this.footnoteBodies.set(id, extended.body);
          if (extended.end > node.node.to) {
            this.footnoteSpans.push({ from: node.node.to, to: extended.end });
          }
          this.footnoteOrder.push(id);
          this.footnoteNumber.set(id, counter);
          return;
        }

        this.refs.set(key, {
          url: href,
          title: title ? this.unquote(this.src.slice(title.from, title.to)) : "",
        });
      },
    });
  }

  /**
   * 脚注定义支持续行：缩进 ≥2 个空格（或一个 tab）的后续行都属于这条注释。
   * CommonMark 不认脚注，Lezer 会把续行解析成独立段落/代码块，所以这里把范围记下来，
   * 渲染正文时跳过，避免注释内容在正文里重复出现。
   */
  private extendedFootnote(first: string, definitionEnd: number): { body: string; end: number } {
    const source = this.src;
    const newline = source.indexOf("\n", definitionEnd);
    if (newline < 0) return { body: first, end: definitionEnd };

    const lines: string[] = [];
    let end = definitionEnd;
    let cursor = newline + 1;
    let blanks = 0;

    while (cursor <= source.length) {
      const next = source.indexOf("\n", cursor);
      const lineEnd = next < 0 ? source.length : next;
      const line = source.slice(cursor, lineEnd);

      if (line.trim() === "") {
        blanks += 1;
        if (next < 0) break;
        cursor = next + 1;
        continue;
      }

      if (!/^(?:\t| {2,})/.test(line)) break;

      for (let index = 0; index < blanks; index += 1) lines.push("");
      blanks = 0;
      lines.push(line.replace(/^(?:\t| {1,4})/, ""));
      end = lineEnd;
      if (next < 0) break;
      cursor = next + 1;
    }

    if (lines.length === 0) return { body: first, end: definitionEnd };
    return { body: [first, ...lines].join("\n"), end };
  }

  private footnoteSection(): string {
    if (this.footnoteOrder.length === 0) return "";
    const items = this.footnoteOrder
      .map((id) => {
        const body = this.footnoteBodies.get(id) ?? "";
        const number = this.footnoteNumber.get(id) ?? 0;
        const back = `<a class="wr-fn-back" href="#fnref-${esc(id)}" aria-label="回到正文">↩</a>`;
        const html = body.includes("\n")
          ? `${renderMarkdown(body).trimEnd()}\n${back}`
          : `<p>${renderInlineMarkdown(body)} ${back}</p>`;
        return `<li id="fn-${esc(id)}" value="${number}">${html}</li>\n`;
      })
      .join("");
    return `<section class="wr-footnotes">\n<hr>\n<ol>\n${items}</ol>\n</section>\n`;
  }

  private collectHeadings(): void {
    const used = new Set<string>();
    this.tree.iterate({
      enter: (node) => {
        const match = HEADING.exec(node.name);
        if (!match) return;
        const level = Number(match[1]);
        const html = this.inline(node.node).trim();
        const plain = html.replace(/<[^>]*>/g, "");
        const id = uniqueSlug(slugify(plain), used);
        this.headings.push({ level, id, html });
        this.headingIdAt.set(node.from, id);
      },
    });
  }

  /** `[TOC]` 段落 → 目录。 */
  private toc(): string {
    const items = this.headings
      .map(
        (heading) =>
          `<li class="wr-toc-${heading.level}"><a href="#${heading.id}">${heading.html}</a></li>`,
      )
      .join("");
    return `<nav class="wr-toc">\n<ul>${items}</ul>\n</nav>\n`;
  }

  /** 渲染单个行内节点的内容（表格单元格用）。 */
  inlineText(node: SyntaxNode): string {
    return this.inline(node);
  }

  /** 渲染单个块节点。 */
  blockHtml(node: SyntaxNode): string {
    return this.block(node);
  }

  /** 紧跟标题的块：与标题绑在一起，避免标题孤零零留在页尾。 */
  private static readonly KEEP_WITH_HEADING = new Set([
    "Paragraph",
    "FencedCode",
    "CodeBlock",
    "Blockquote",
    "HTMLBlock",
  ]);

  /** 块级：逐个渲染顶层子节点。 */
  private blocks(node: SyntaxNode): string {
    const children: SyntaxNode[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);

    let out = "";
    for (let index = 0; index < children.length; index += 1) {
      const child = children[index]!;
      // 多行脚注的续行：内容已经并入脚注，正文里不再单独渲染。
      if (this.footnoteSpans.some((span) => child.from >= span.from && child.to <= span.to)) continue;
      const html = this.block(child);

      if (HEADING.test(child.name)) {
        const next = children[index + 1];
        if (next) {
          // 标题与下一块：默认绑在一起避免页尾孤行；表格不绑（否则跨页表头会丢）。
          const keep = HtmlRenderer.KEEP_WITH_HEADING.has(next.name) || HEADING.test(next.name);
          // 源码里标题和下一块之间如果有空行，编辑器里那一行是看得见的空白，
          // 打印没有空行，所以要按同样的距离补出来（见 printStyles 的 .wr-gap）。
          const blank = /^\s*$/.test(this.src.slice(child.to, next.from));
          if (keep || blank) {
            const cls = [keep ? "wr-keep" : "", blank ? "wr-gap" : ""].filter(Boolean).join(" ");
            out += `<div class="${cls}">\n${html}${this.block(next)}</div>\n`;
            index += 1;
            continue;
          }
        }
      }

      out += html;
    }
    return out;
  }

  private block(node: SyntaxNode): string {
    // 标记类节点（QuoteMark / ListMark …）不是块，别被默认分支包成 <p>。
    if (MARK_NODES.has(node.name)) return "";

    const heading = HEADING.exec(node.name);
    if (heading) {
      const level = Number(heading[1]);
      const id = this.headingIdAt.get(node.from) ?? slugify(this.src.slice(node.from, node.to));
      const html = this.inline(node).trim();
      return `<h${level} id="${esc(id)}">${html}</h${level}>\n`;
    }

    if (node.name === "Paragraph") {
      const raw = this.src.slice(node.from, node.to).trim();
      if (/^\$\$[\s\S]*\$\$$/.test(raw)) {
        const tex = this.math?.blocks.get(node.from) ?? raw.slice(2, -2);
        const html = renderMathHtml(tex, true);
        if (html) return `<div class="wr-math-block">${html}</div>\n`;
      }
      // 定义列表：CommonMark 里只是普通段落，按行形状识别（见 markdown/deflist.ts）。
      // 只认顶层段落 —— 与编辑器 analyze 同一口径，否则「编辑器里是源码、纸上变成列表」。
      const definition =
        node.node.parent?.name === "Document"
          ? parseDefinitionList(this.src.slice(node.from, node.to))
          : null;
      if (definition) return this.definitionList(definition);
    }

    if (node.name === "Paragraph" && /^\[toc\]$/i.test(this.src.slice(node.from, node.to).trim())) {
      return this.toc();
    }

    switch (node.name) {
      case "Paragraph":
        return `<p>${this.inline(node)}</p>\n`;
      case "Blockquote":
        return `<blockquote>\n${this.blocks(node)}</blockquote>\n`;
      case "BulletList":
      case "OrderedList":
        return this.list(node);
      case "FencedCode":
      case "CodeBlock":
        return this.code(node);
      case "HorizontalRule":
        return `<hr>\n`;
      case "LinkReference":
        // 引用/脚注定义在 Typora 里不直接出现在正文中。
        return "";
      case "Table":
        return this.table(node);
      case "HTMLBlock":
        return `${this.src.slice(node.from, node.to)}\n`;
      case "CommentBlock": {
        const raw = this.src.slice(node.from, node.to).trim();
        return /^<!--\s*pagebreak\s*-->$/i.test(raw)
          ? `<div class="wr-page-break"></div>\n`
          : "";
      }
      default:
        return node.firstChild ? this.blocks(node) : `<p>${esc(this.src.slice(node.from, node.to)).trim()}</p>\n`;
    }
  }

  private definitionList(list: DefinitionList): string {
    const term = renderInlineMarkdown(list.term);
    const details = list.details.map((text) => `<dd>${renderInlineMarkdown(text)}</dd>`).join("\n");
    return `<dl class="wr-dl">\n<dt>${term}</dt>\n${details}\n</dl>\n`;
  }

  private list(node: SyntaxNode): string {
    const ordered = node.name === "OrderedList";
    // 列表松紧：项之间有空行即视为 loose，段落要包 <p>。
    const tight = !/\n[ \t]*\n/.test(this.src.slice(node.from, node.to));
    const items = node.getChildren("ListItem");

    let start = 1;
    if (ordered) {
      const firstMark = items[0]?.getChild("ListMark");
      if (firstMark) start = Number.parseInt(this.src.slice(firstMark.from, firstMark.to), 10) || 1;
    }

    const loose = !tight;
    let out = ordered
      ? `<ol${start !== 1 ? ` start="${start}"` : ""}${loose ? ' class="wr-loose"' : ""}>\n`
      : `<ul${loose ? ' class="wr-loose"' : ""}>\n`;
    for (const item of items) out += this.listItem(item, tight);
    out += ordered ? "</ol>\n" : "</ul>\n";
    return out;
  }

  private listItem(item: SyntaxNode, tight: boolean): string {
    let inner = "";

    for (let child = item.firstChild; child; child = child.nextSibling) {
      if (child.name === "ListMark") continue;

      if (child.name === "Task") {
        const marker = child.getChild("TaskMarker");
        const checked = marker ? /\[[xX]\]/.test(this.src.slice(marker.from, marker.to)) : false;
        const paragraph = child.getChild("Paragraph");
        const content = paragraph
          ? this.inline(paragraph)
          : marker
            ? this.inlineChildren(child, marker.to, child.to)
            : this.inlineChildren(child, child.from, child.to);
        inner += `<p class="wr-task"><span class="wr-task-box${checked ? " is-checked" : ""}" aria-hidden="true">${checked ? "☑" : "☐"}</span> ${content.trim()}</p>\n`;
        continue;
      }

      if (child.name === "Paragraph" && tight) {
        inner += `${this.inline(child)}\n`;
        continue;
      }

      inner += this.block(child);
    }

    return `<li>${inner.trimEnd()}</li>\n`;
  }

  private code(node: SyntaxNode): string {
    const info = node.getChild("CodeInfo");
    const lang = info ? this.src.slice(info.from, info.to).trim().split(/\s+/)[0] ?? "" : "";
    const text = node.getChild("CodeText");
    const body = text ? this.src.slice(text.from, text.to) : "";
    const cls = lang ? ` class="language-${esc(lang)}"` : "";
    return `<pre${lang ? ` data-lang="${esc(lang)}"` : ""}><code${cls}>${esc(body)}</code></pre>\n`;
  }

  private table(node: SyntaxNode): string {
    const header = node.getChild("TableHeader");
    const rows = node.getChildren("TableRow");
    const align = this.tableAlignment(node);
    const percents = this.tableWidths(node);

    const renderCell = (cell: SyntaxNode, index: number, tag: "th" | "td"): string => {
      const cls = ALIGN_CLASS[align[index] ?? ""] ?? "";
      const attr = cls ? ` class="${cls}"` : "";
      return `<${tag}${attr}>${this.inline(cell).trim()}</${tag}>`;
    };
    let out = percents.length > 0 ? '<table class="wr-fixed">\n' : "<table>\n";
    if (percents.length > 0) {
      out += `<colgroup>${percents.map((percent) => `<col style="width:${percent}%">`).join("")}</colgroup>\n`;
    }
    if (header) {
      const cells = header.getChildren("TableCell");
      out += "<thead>\n<tr>" + cells.map((cell, i) => renderCell(cell, i, "th")).join("") + "</tr>\n</thead>\n";
    }
    out += "<tbody>\n";
    for (const row of rows) {
      const cells = row.getChildren("TableCell");
      out += "<tr>" + cells.map((cell, i) => renderCell(cell, i, "td")).join("") + "</tr>\n";
    }
    out += "</tbody>\n</table>\n";
    return out;
  }

  /** GFM 对齐信息只存在于分隔行（|:--|--:|）里。 */
  private tableAlignment(node: SyntaxNode): string[] {
    const delimiter = node.getChildren("TableDelimiter")[0];
    if (!delimiter) return [];
    return parseAlignment(this.src.slice(delimiter.from, delimiter.to));
  }

  /** 列宽也写在分隔行里（横线数量）；各列等宽时返回空数组。 */
  private tableWidths(node: SyntaxNode): number[] {
    const delimiter = node.getChildren("TableDelimiter")[0];
    if (!delimiter) return [];
    return columnPercents(this.src.slice(delimiter.from, delimiter.to));
  }

  // ---- 行内 ----

  private inline(node: SyntaxNode): string {
    return this.inlineChildren(node, node.from, node.to);
  }

  private inlineChildren(parent: SyntaxNode, from: number, to: number): string {
    let out = "";
    let pos = from;

    for (let child = parent.firstChild; child; child = child.nextSibling) {
      if (child.to <= from) continue;
      if (child.from >= to) break;

      const start = Math.max(child.from, from);
      const end = Math.min(child.to, to);
      if (start > pos) out += esc(this.src.slice(pos, start));
      out += this.inlineNode(child);
      pos = end;
    }

    if (pos < to) out += esc(this.src.slice(pos, to));
    return out;
  }

  private inlineNode(node: SyntaxNode): string {
    const raw = this.src.slice(node.from, node.to);

    switch (node.name) {
      case "StrongEmphasis":
        return `<strong>${this.inlineChildren(node, node.from, node.to)}</strong>`;
      case "Emphasis":
        return `<em>${this.inlineChildren(node, node.from, node.to)}</em>`;
      case "Strikethrough":
        return `<del>${this.inlineChildren(node, node.from, node.to)}</del>`;
      case "Subscript":
        return `<sub>${this.inlineChildren(node, node.from + 1, node.to - 1)}</sub>`;
      case "Superscript":
        return `<sup>${this.inlineChildren(node, node.from + 1, node.to - 1)}</sup>`;
      case "Highlight":
        return `<mark>${this.inlineChildren(node, node.from + 2, node.to - 2)}</mark>`;
      case "InlineMath": {
        const tex = this.math ? this.math.inline(this.src.slice(node.from + 1, node.to - 1)) : this.src.slice(node.from + 1, node.to - 1);
        return renderMathHtml(tex, false) ?? `<code>${esc(tex)}</code>`;
      }
      case "Emoji": {
        const name = raw.slice(1, -1);
        const char = emojiFor(name);
        return char ?? esc(raw);
      }
      case "InlineCode": {
        const body = raw.replace(/^`+/, "").replace(/`+$/, "");
        const trimmed = /^ .* $/.test(body) ? body.slice(1, -1) : body;
        return `<code>${esc(trimmed)}</code>`;
      }
      case "Link":
        return this.link(node);
      case "Image":
        return this.image(node);
      case "Autolink": {
        const target = raw.startsWith("<") ? raw.slice(1, -1) : raw;
        const href = /^[a-z][a-z0-9+.-]*:/i.test(target) ? target : `mailto:${target}`;
        return `<a href="${esc(href)}">${esc(target)}</a>`;
      }
      case "URL":
        return `<a href="${esc(raw)}">${esc(raw)}</a>`;
      case "HardBreak":
        return "<br>\n";
      case "Escape":
        return esc(raw.slice(1));
      case "Entity":
        return /^&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);$/.test(raw) ? raw : esc(raw);
      case "HTMLTag":
        return raw;
      default:
        if (MARK_NODES.has(node.name)) return "";
        return node.firstChild ? this.inlineChildren(node, node.from, node.to) : esc(raw);
    }
  }

  private link(node: SyntaxNode): string {
    const raw = this.src.slice(node.from, node.to);

    // 脚注引用 [^id]
    if (raw.startsWith("[^")) {
      const id = raw.slice(2, raw.lastIndexOf("]")).trim().toLowerCase();
      const number = this.footnoteNumber.get(id);
      if (number === undefined) return esc(raw);
      return `<sup class="wr-fn-ref"><a href="#fn-${esc(id)}" id="fnref-${esc(id)}">${number}</a></sup>`;
    }

    const url = node.getChild("URL");
    const title = node.getChild("LinkTitle");
    const marks = node.getChildren("LinkMark");
    const from = marks[0] ? marks[0].to : node.from;
    const to = marks[1] ? marks[1].from : (url ? url.from : node.to);
    const label = this.inlineChildren(node, from, to);

    if (!url) {
      // 参考链接 [文字][ref]：去定义表里找。
      const ref = node.getChild("LinkLabel");
      const entry = ref ? this.refs.get(normalizeRef(this.src.slice(ref.from, ref.to))) : undefined;
      if (!entry) return label || esc(raw);
      const refTitle = entry.title ? ` title="${esc(entry.title)}"` : "";
      return `<a href="${esc(entry.url)}"${refTitle}>${label}</a>`;
    }

    const href = this.src.slice(url.from, url.to);
    const titleAttr = title ? ` title="${esc(this.unquote(this.src.slice(title.from, title.to)))}"` : "";
    return `<a href="${esc(href)}"${titleAttr}>${label}</a>`;
  }

  private image(node: SyntaxNode): string {
    const url = node.getChild("URL");
    const title = node.getChild("LinkTitle");
    const marks = node.getChildren("LinkMark");
    const from = marks[0] ? marks[0].to : node.from;
    const to = marks[1] ? marks[1].from : (url ? url.from : node.to);
    const alt = this.src.slice(from, to);

    if (!url) return esc(alt);
    const target = parseImageTarget(this.src.slice(url.from, url.to));
    const titleAttr = title ? ` title="${esc(this.unquote(this.src.slice(title.from, title.to)))}"` : "";
    const altAttr = alt ? ` alt="${esc(alt)}"` : ' alt=""';
    const sizeAttrs = `${target.width ? ` width="${target.width}"` : ""}${target.height ? ` height="${target.height}"` : ""}`;
    return `<img src="${esc(target.src)}"${altAttr}${titleAttr}${sizeAttrs} loading="lazy">`;
  }

  private unquote(text: string): string {
    const trimmed = text.trim();
    const first = trimmed[0];
    if ((first === '"' || first === "'") && trimmed.endsWith(first)) return trimmed.slice(1, -1);
    if (first === "(" && trimmed.endsWith(")")) return trimmed.slice(1, -1);
    return trimmed;
  }
}

export interface RenderOptions {
  /** 默认 true：用白名单清洗行内 HTML / SVG。测试里可关掉看原始输出。 */
  sanitize?: boolean;
  /** 块级公式自动编号（偏好在「编辑器 → 公式」里）。 */
  mathNumbering?: boolean;
}

/** 渲染整篇文档为 HTML（不含 <html> 外壳）。 */
export function renderMarkdown(source: string, options: RenderOptions = {}): string {
  const front = parseFrontMatter(source);
  const body = replaceSizedImages(front ? front.body : source);
  const tree = writaraParser.parse(body);
  const html = new HtmlRenderer(body, tree, options).render();
  return options.sanitize === false ? html : sanitizeHtml(html);
}

/**
 * 渲染一段行内 Markdown（表格单元格用）。
 * 返回值可能带 <p>，放进 <td> 里是合法的。
 */
export function renderInlineMarkdown(source: string): string {
  const tree = writaraParser.parse(replaceSizedImages(source));
  const renderer = new HtmlRenderer(source, tree);
  const first = tree.topNode.firstChild;
  if (!first) return "";
  const html = first.name === "Paragraph" ? renderer.inlineText(first) : renderer.blockHtml(first);
  return html.trim();
}

/** 取正文里第一个标题作文档标题；没有标题就用 front matter 的 title，最后用兜底。 */
export function documentTitle(source: string, fallback = "未命名文档"): string {
  const front = parseFrontMatter(source);
  const body = front ? front.body : source;
  const tree = writaraParser.parse(body);
  let title = "";

  tree.iterate({
    enter: (node) => {
      // 已经拿到第一个标题：只跳过后续节点的子节点，不再让后面的标题覆盖。
      // （Tree.iterate 没有「停止遍历」的返回值，return false 只表示不下钻。）
      if (title) return false;
      if (!HEADING.test(node.name)) return undefined;
      let text = body.slice(node.from, node.to);
      text = text.replace(/^[ \t]*#{1,6}[ \t]*/m, "");
      text = text.replace(/[ \t]+#+[ \t]*$/, "");
      text = text.replace(/^[ \t]*(=+|-+)[ \t]*$/m, "");
      title = text.replace(/[*_`~]/g, "").trim();
      return false;
    },
  });

  return title || front?.title || fallback;
}
