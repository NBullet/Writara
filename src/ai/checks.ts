import { parseFrontMatter } from "../markdown/frontmatter";
import { slugify } from "../markdown/slug";
import { scanSlop } from "./antislop";

/**
 * 文档体检：写作流水线的「编译器」。
 *
 * 代码能跑就是验收，文章没有运行这回事——所以用确定性规则替代编译器：
 * 结构（标题层级、空章节）、语言（标点、大小写、重复句）、链接（断链、锚点）、
 * 形式（表格列数、围栏、公式）。规则层离线可跑，模型只负责改，不负责判断。
 *
 * 只做保守判断：拿不准的一律不报（宁漏勿伤），每条问题都能落到文档位置。
 */

export type CheckSeverity = "error" | "warn" | "info";
export type CheckGroup = "structure" | "language" | "links" | "form" | "style" | "novel";
/** 体检档位：方案类侧重结构与引用，小说档额外查章节长短。 */
export type CheckProfile = "general" | "proposal" | "novel";

export interface CheckFix {
  from: number;
  to: number;
  insert: string;
}

export interface CheckIssue {
  rule: string;
  group: CheckGroup;
  severity: CheckSeverity;
  message: string;
  /** 文档偏移；无法定位时为 null（例如全篇统计类问题）。 */
  from: number | null;
  to: number | null;
  /** 行号，1 起。 */
  line: number | null;
  /** 可自动修复的最小改动。 */
  fix?: CheckFix;
}

export interface CheckOptions {
  /** 项目内已知的 Markdown 路径（相对工作区根），用于断链检查。 */
  files?: string[];
  /** 当前文档相对工作区根的路径；为空时不做断链检查。 */
  docPath?: string | null;
  /** 跨文件标题锚点：返回 null 表示读不到（跳过这项）。 */
  anchorsOf?: (path: string) => string[] | null;
  profile?: CheckProfile;
  limits?: { paragraph?: number; sentence?: number };
}

export const DEFAULT_LIMITS = { paragraph: 300, sentence: 120 };

interface LineInfo {
  start: number;
  end: number;
  text: string;
  /** 1 起。 */
  line: number;
}

interface HeadingInfo {
  level: number;
  text: string;
  from: number;
  to: number;
  /** 标题所在行（0 起）的索引。 */
  lineIndex: number;
}

interface Doc {
  source: string;
  lines: LineInfo[];
  /** 每一行是否在围栏里（围栏行与内容行都算）。 */
  fenced: boolean[];
  /** 每一行是否在 HTML / SVG 块里（含注释块）。这些行不是正文，体检规则一律跳过。 */
  html: boolean[];
  headings: HeadingInfo[];
  /** front matter 区间。 */
  front: { from: number; to: number } | null;
  /** 未闭合的围栏：起始行号（0 起）。 */
  unclosedFence: number | null;
}

const FENCE = /^\s*(`{3,}|~{3,})/;
const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t#]*$/;

/**
 * 会被当成「块」的 HTML 标签。内联标签（span / img / a…）不算，
 * 否则一行里的 `<span>` 会把整行正文排除掉。
 */
const HTML_BLOCK_TAGS = new Set([
  "svg",
  "details",
  "summary",
  "div",
  "section",
  "article",
  "aside",
  "header",
  "footer",
  "table",
  "figure",
  "figcaption",
  "video",
  "audio",
  "iframe",
  "style",
  "script",
  "pre",
  "blockquote",
  "canvas",
]);

const HTML_BLOCK_START = /^<([a-zA-Z][\w:-]*)(?:\s|>|\/)/;

/** 这一行是否关闭了当前 HTML 块（同一行的 `</tag>`、`/>` 或 `-->`）。 */
function closesHtmlBlock(line: string, tag: string): boolean {
  if (tag === "!--") return line.includes("-->", 4);
  if (new RegExp(`</${tag}\\s*>`, "i").test(line)) return true;
  return new RegExp(`<${tag}\\b[^>]*/>`, "i").test(line);
}

function buildDoc(source: string): Doc {
  const front = parseFrontMatter(source);
  const lines: LineInfo[] = [];
  const fenced: boolean[] = [];
  const html: boolean[] = [];
  const headings: HeadingInfo[] = [];

  let pos = 0;
  let index = 0;
  let fence: { marker: string; line: number } | null = null;
  /** 当前所在的 HTML 块标签；`!--` 表示跨行注释。 */
  let htmlTag: string | null = null;

  while (pos <= source.length) {
    const newline = source.indexOf("\n", pos);
    const end = newline < 0 ? source.length : newline;
    const line = source.slice(pos, end);
    const inFence = Boolean(fence);
    const inFront = front ? pos < front.to : false;

    // HTML / SVG 块（围栏与 front matter 之外）：块内按非正文处理。
    let inHtml = false;
    if (!inFence && !inFront) {
      if (htmlTag) {
        inHtml = true;
        if (closesHtmlBlock(line, htmlTag)) htmlTag = null;
      } else {
        const trimmed = line.trim();
        if (trimmed.startsWith("<!--")) {
          inHtml = true;
          if (!closesHtmlBlock(trimmed, "!--")) htmlTag = "!--";
        } else {
          const match = HTML_BLOCK_START.exec(trimmed);
          const tag = match?.[1]?.toLowerCase();
          if (tag && HTML_BLOCK_TAGS.has(tag)) {
            inHtml = true;
            if (!closesHtmlBlock(trimmed, tag)) htmlTag = tag;
          }
        }
      }
    }
    html.push(inHtml);

    lines.push({ start: pos, end, text: line, line: index + 1 });
    fenced.push(inFence);

    if (!inFence && !inFront) {
      // HTML 块里不解析 Markdown：不要把块内的 ``` 当成围栏开始。
      const open = inHtml ? null : FENCE.exec(line);
      if (open) {
        fence = { marker: (open[1] ?? "```")[0]!.repeat(3), line: index };
        fenced[index] = true;
      } else if (!inHtml) {
        const heading = HEADING.exec(line);
        if (heading) {
          headings.push({
            level: heading[1]!.length,
            text: (heading[2] ?? "").trim(),
            from: pos,
            to: end,
            lineIndex: index,
          });
        }
      }
    } else if (inFence && fence && line.trim().startsWith(fence.marker)) {
      fenced[index] = true;
      fence = null;
    }

    if (newline < 0) break;
    pos = newline + 1;
    index += 1;
  }

  return {
    source,
    lines,
    fenced,
    html,
    headings,
    front: front ? { from: front.from, to: front.to } : null,
    unclosedFence: fence ? fence.line : null,
  };
}

/** 行内受保护区间：`代码`、[文字](地址)、<https://…>。 */
function protectedRanges(line: string): Array<{ from: number; to: number }> {
  const out: Array<{ from: number; to: number }> = [];
  const pattern = /(`[^`\n]+`)|\]\([^)\n]+\)|(<https?:\/\/[^>\s]+>)/g;
  for (const match of line.matchAll(pattern)) {
    out.push({ from: match.index ?? 0, to: (match.index ?? 0) + match[0]!.length });
  }
  return out;
}

function inProtected(ranges: Array<{ from: number; to: number }>, offset: number): boolean {
  return ranges.some((range) => offset >= range.from && offset < range.to);
}

export function runChecks(source: string, options: CheckOptions = {}): CheckIssue[] {
  const doc = buildDoc(source);
  const limits = { ...DEFAULT_LIMITS, ...options.limits };
  const issues: CheckIssue[] = [];

  checkStructure(doc, issues, limits);
  checkLanguage(doc, issues);
  checkRepeats(doc, issues);
  checkLinks(doc, issues, options);
  checkForm(doc, issues);
  checkSlop(source, issues);
  if (options.profile === "novel") checkNovel(doc, issues);

  return finalize(
    doc,
    issues.sort((a, b) => (a.from ?? 0) - (b.from ?? 0)),
  );
}

/** 把 from 补成「有行号」的 issue。 */
function atLine(doc: Doc, from: number | null): number | null {
  if (from === null) return null;
  const hit = doc.lines.find((line) => from >= line.start && from <= line.end);
  return hit ? hit.line : null;
}

function finalize(doc: Doc, items: CheckIssue[]): CheckIssue[] {
  for (const item of items) item.line = atLine(doc, item.from);
  return items;
}

function checkStructure(
  doc: Doc,
  out: CheckIssue[],
  limits: { paragraph: number; sentence: number },
): void {
  const headings = doc.headings;

  // 标题层级跳跃
  for (let i = 1; i < headings.length; i += 1) {
    const prev = headings[i - 1]!;
    const current = headings[i]!;
    if (current.level > prev.level + 1) {
      out.push({
        rule: "heading-jump",
        group: "structure",
        severity: "warn",
        message: `标题从 h${prev.level} 跳到 h${current.level}，中间缺 h${prev.level + 1} 层级`,
        from: current.from,
        to: current.to,
        line: null,
      });
    }
  }

  // 同名标题（锚点冲突）
  const seen = new Map<string, number>();
  for (const heading of headings) {
    const slug = slugify(heading.text);
    const count = seen.get(slug) ?? 0;
    if (count === 1) {
      out.push({
        rule: "heading-duplicate",
        group: "structure",
        severity: "warn",
        message: `标题「${heading.text}」重复，锚点会产生 -1 后缀，跨文件引用容易指错`,
        from: heading.from,
        to: heading.to,
        line: null,
      });
    }
    seen.set(slug, count + 1);
  }

  // 空章节：标题到下一个同级/更高级标题之间没有正文
  for (let i = 0; i < headings.length; i += 1) {
    const heading = headings[i]!;
    let end = doc.source.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      if (headings[j]!.level <= heading.level) {
        end = headings[j]!.from;
        break;
      }
    }
    const chunk = doc.source.slice(heading.to, end);
    const body = chunk
      .split("\n")
      .filter((line) => {
        const trimmed = line.trim();
        if (!trimmed) return false;
        if (HEADING.test(trimmed)) return false;
        if (/^<!--[\s\S]*-->$/.test(trimmed)) return false;
        return true;
      })
      .join("");
    if (body.length === 0 && heading.level <= 3) {
      out.push({
        rule: "empty-section",
        group: "structure",
        severity: "warn",
        message: `章节「${heading.text}」下面是空的`,
        from: heading.from,
        to: heading.to,
        line: null,
      });
    }
  }

  // 段落过长 / 句子过长（只看正文段落；表格、列表、引用、代码都不参与）
  let paragraphStart: number | null = null;
  let paragraphText = "";
  const flush = (): void => {
    if (paragraphStart !== null) {
      const body = paragraphText.trim();
      if (body.length > limits.paragraph) {
        out.push({
          rule: "long-paragraph",
          group: "structure",
          severity: "info",
          message: `段落约 ${body.length} 字，超过 ${limits.paragraph} 字，建议分段`,
          from: paragraphStart,
          to: paragraphStart + paragraphText.length,
          line: null,
        });
      }
      // 句子只在同一段内切，避免把表格 / 列表拼成一个「长句」
      const sentences = paragraphText.split(/(?<=[。！？…])/u);
      let cursor = paragraphStart;
      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (trimmed.length > limits.sentence) {
          out.push({
            rule: "long-sentence",
            group: "structure",
            severity: "info",
            message: `句子约 ${trimmed.length} 字，超过 ${limits.sentence} 字，建议拆句`,
            from: cursor,
            to: cursor + sentence.length,
            line: null,
          });
        }
        cursor += sentence.length;
      }
    }
    paragraphStart = null;
    paragraphText = "";
  };

  for (let i = 0; i < doc.lines.length; i += 1) {
    const line = doc.lines[i]!;
    const trimmed = line.text.trim();
    const paragraphLine =
      !doc.fenced[i] &&
      !doc.html[i] &&
      trimmed.length > 0 &&
      !HEADING.test(trimmed) &&
      !/^([-*+]\s|\d+[.、)]\s|>|\||<!--|```|~~~|\$\$)/.test(trimmed) &&
      (doc.front ? line.start >= doc.front.to : true);

    if (paragraphLine) {
      if (paragraphStart === null) paragraphStart = line.start;
      paragraphText += `${line.text}\n`;
    } else {
      flush();
    }
  }
  flush();
}

const HALF_TO_FULL: Record<string, string> = {
  ",": "，",
  ";": "；",
  ":": "：",
  "?": "？",
  "!": "！",
};

function checkLanguage(doc: Doc, out: CheckIssue[]): void {
  const CJK = /[\u4e00-\u9fff]/;
  let reported = 0;

  for (let i = 0; i < doc.lines.length; i += 1) {
    if (doc.fenced[i] || doc.html[i]) continue;
    const line = doc.lines[i]!;
    if (doc.front && line.start < doc.front.to) continue;
    const ranges = protectedRanges(line.text);

    for (let offset = 0; offset < line.text.length; offset += 1) {
      const char = line.text[offset]!;
      const next = line.text[offset + 1] ?? "";
      const prev = line.text[offset - 1] ?? "";
      let hit = false;
      if (char === ".") {
        hit = CJK.test(prev) && (next === "" || /[\s"'“”‘’）)]/.test(next));
      } else if (char in HALF_TO_FULL) {
        hit = CJK.test(prev) || CJK.test(next);
      }
      if (!hit || inProtected(ranges, offset)) continue;
      if (reported >= 30) {
        out.push({
          rule: "halfwidth-punct",
          group: "language",
          severity: "warn",
          message: "还有更多半角标点，未逐条列出（先修上面这些）",
          from: null,
          to: null,
          line: null,
        });
        return;
      }
      const from = line.start + offset;
      out.push({
        rule: "halfwidth-punct",
        group: "language",
        severity: "warn",
        message: `中文句子里用了半角「${char}」，应为「${HALF_TO_FULL[char] ?? "。"}」`,
        from,
        to: from + 1,
        line: null,
        fix: { from, to: from + 1, insert: char === "." ? "。" : (HALF_TO_FULL[char] ?? char) },
      });
      reported += 1;
    }
  }

  // 同一英文词的大小写变体（API / api）
  const words = new Map<string, { shown: string; from: number; count: number }>();
  for (let i = 0; i < doc.lines.length; i += 1) {
    if (doc.fenced[i] || doc.html[i]) continue;
    const line = doc.lines[i]!;
    if (doc.front && line.start < doc.front.to) continue;
    const ranges = protectedRanges(line.text);
    for (const match of line.text.matchAll(/\b[A-Za-z][A-Za-z0-9-]{1,}\b/g)) {
      const raw = match[0]!;
      if (inProtected(ranges, match.index ?? 0)) continue;
      const key = raw.toLowerCase();
      const hit = words.get(key);
      if (!hit) {
        words.set(key, { shown: raw, from: line.start + (match.index ?? 0), count: 1 });
        continue;
      }
      hit.count += 1;
      if (hit.shown !== raw && hit.count <= 4) {
        out.push({
          rule: "ascii-case",
          group: "language",
          severity: "info",
          message: `「${hit.shown}」与「${raw}」大小写不一致，统一一种写法`,
          from: line.start + (match.index ?? 0),
          to: line.start + (match.index ?? 0) + raw.length,
          line: null,
        });
      }
    }
  }
}

function checkRepeats(doc: Doc, out: CheckIssue[]): void {
  const seen = new Map<string, number>();
  const pattern = /[^。！？…\n]{12,}[。！？…]/gu;
  for (let i = 0; i < doc.lines.length; i += 1) {
    if (doc.fenced[i] || doc.html[i]) continue;
    const line = doc.lines[i]!;
    for (const match of line.text.matchAll(pattern)) {
      const sentence = match[0]!.trim();
      const first = seen.get(sentence);
      const from = line.start + (match.index ?? 0);
      if (first === undefined) {
        seen.set(sentence, from);
      } else {
        out.push({
          rule: "duplicate-sentence",
          group: "language",
          severity: "warn",
          message: `这句话前面已经出现过：${sentence.slice(0, 24)}${sentence.length > 24 ? "…" : ""}`,
          from,
          to: from + sentence.length,
          line: null,
        });
      }
    }
  }
}

function normalizePath(fromDir: string, target: string): string {
  const parts = `${fromDir}/${target}`.split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return stack.join("/");
}

function dirOf(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash < 0 ? "" : path.slice(0, slash);
}

function checkLinks(doc: Doc, out: CheckIssue[], options: CheckOptions): void {
  const anchors = new Set(doc.headings.map((heading) => slugify(heading.text)));
  const files = options.files ? new Set(options.files) : null;
  const linkPattern = /(!?)\[([^\]\n]*)\]\(([^)\n]+)\)/g;

  for (let i = 0; i < doc.lines.length; i += 1) {
    if (doc.fenced[i] || doc.html[i]) continue;
    const line = doc.lines[i]!;
    if (doc.front && line.start < doc.front.to) continue;

    for (const match of line.text.matchAll(linkPattern)) {
      const image = match[1] === "!";
      const rawTarget = (match[3] ?? "").trim();
      // 去掉标题、图片尺寸语法
      const target = rawTarget
        .replace(/\s+["'][^"']*["']\s*$/, "")
        .replace(/\s+=\s*\d+(?:x\d+)?\s*$/, "")
        .replace(/^<|>$/g, "")
        .trim();
      if (!target || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(target)) continue;

      const from = line.start + (match.index ?? 0);

      // 纯锚点
      if (target.startsWith("#")) {
        const anchor = target.slice(1);
        if (anchor && !anchors.has(anchor)) {
          out.push({
            rule: "broken-anchor",
            group: "links",
            severity: "warn",
            message: `锚点 #${anchor} 在本文件里不存在`,
            from,
            to: from + match[0]!.length,
            line: null,
          });
        }
        continue;
      }

      // 图片 / 附件：不参与断链检查（工作区扫描只收 Markdown）
      const [pathPart, anchorPart] = target.split("#");
      if (image || !pathPart) continue;
      if (!/\.(md|markdown|mdx|txt)$/i.test(pathPart)) continue;

      const baseDir = options.docPath ? dirOf(options.docPath) : "";
      const resolved = normalizePath(baseDir, pathPart);
      if (files && !files.has(resolved)) {
        out.push({
          rule: "broken-link",
          group: "links",
          severity: "error",
          message: `链接目标 ${pathPart} 不在工作区里`,
          from,
          to: from + match[0]!.length,
          line: null,
        });
        continue;
      }

      if (anchorPart && resolved !== options.docPath) {
        const known = options.anchorsOf?.(resolved);
        if (known && !known.includes(anchorPart)) {
          out.push({
            rule: "broken-anchor",
            group: "links",
            severity: "warn",
            message: `链接里的锚点 #${anchorPart} 在 ${pathPart} 里不存在`,
            from,
            to: from + match[0]!.length,
            line: null,
          });
        }
      }
    }
  }
}

function splitCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < trimmed.length; i += 1) {
    const char = trimmed[i]!;
    if (char === "\\") {
      current += char + (trimmed[i + 1] ?? "");
      i += 1;
      continue;
    }
    if (char === "|") {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(current);
  return cells;
}

function checkForm(doc: Doc, out: CheckIssue[]): void {
  // 围栏未闭合
  if (doc.unclosedFence !== null) {
    const line = doc.lines[doc.unclosedFence]!;
    out.push({
      rule: "fence-unclosed",
      group: "form",
      severity: "error",
      message: "代码围栏没有闭合，后面的内容都会被当成代码",
      from: line.start,
      to: line.end,
      line: null,
    });
  }

  // 表格列数
  let tableStart = -1;
  let tableColumns = 0;
  const flushTable = (): void => {
    tableStart = -1;
    tableColumns = 0;
  };
  for (let i = 0; i < doc.lines.length; i += 1) {
    const line = doc.lines[i]!;
    const isRow = !doc.fenced[i] && !doc.html[i] && line.text.trim().startsWith("|");
    if (!isRow) {
      flushTable();
      continue;
    }
    const cells = splitCells(line.text);
    if (tableStart < 0) {
      tableStart = i;
      tableColumns = cells.length;
      continue;
    }
    // 第二行是分隔行：列数应当与表头一致
    if (i === tableStart + 1) continue;
    if (cells.length !== tableColumns) {
      out.push({
        rule: "table-columns",
        group: "form",
        severity: "warn",
        message: `表格这一行有 ${cells.length} 列，表头是 ${tableColumns} 列`,
        from: line.start,
        to: line.end,
        line: null,
      });
    }
  }

  // 空 Mermaid
  for (let i = 0; i < doc.lines.length; i += 1) {
    const line = doc.lines[i]!;
    if (!/^\s*```+\s*mermaid/i.test(line.text)) continue;
    let j = i + 1;
    let content = "";
    while (j < doc.lines.length && !/^\s*```+\s*$/.test(doc.lines[j]!.text)) {
      content += doc.lines[j]!.text.trim();
      j += 1;
    }
    if (!content) {
      out.push({
        rule: "empty-mermaid",
        group: "form",
        severity: "warn",
        message: "Mermaid 代码块是空的",
        from: line.start,
        to: line.end,
        line: null,
      });
    }
    i = j;
  }

  // 块级公式 $$ 不成对（围栏外）
  let mathCount = 0;
  let mathFrom = 0;
  for (let i = 0; i < doc.lines.length; i += 1) {
    if (doc.fenced[i] || doc.html[i]) continue;
    const line = doc.lines[i]!;
    for (const match of line.text.matchAll(/\$\$/g)) {
      mathCount += 1;
      if (mathCount === 1) mathFrom = line.start + (match.index ?? 0);
    }
  }
  if (mathCount % 2 === 1) {
    out.push({
      rule: "math-unclosed",
      group: "form",
      severity: "error",
      message: "块级公式的 $$ 没有配对",
      from: mathFrom,
      to: mathFrom + 2,
      line: null,
    });
  }
}

function checkSlop(source: string, out: CheckIssue[]): void {
  const hits = scanSlop(source);
  if (!hits.length) return;
  const byKind = new Map<string, { count: number; first: number }>();
  for (const hit of hits) {
    const entry = byKind.get(hit.kind);
    if (entry) entry.count += 1;
    else byKind.set(hit.kind, { count: 1, first: hit.from });
  }
  const names: Record<string, string> = {
    phrase: "过场话",
    emoji: "emoji",
    bold: "列表腔加粗",
    tail: "打圆场的收尾段",
  };
  for (const [kind, entry] of byKind) {
    out.push({
      rule: "ai-slop",
      group: "style",
      severity: "info",
      message: `${names[kind] ?? kind} × ${entry.count}（可用「检查 AI 腔」查看标记）`,
      from: entry.first,
      to: entry.first + 1,
      line: null,
    });
  }
}

const GROUP_LABELS: Record<CheckGroup, string> = {
  structure: "结构",
  language: "语言",
  links: "链接",
  form: "形式",
  style: "风格",
  novel: "长篇",
};

const SEVERITY_LABELS: Record<CheckSeverity, string> = {
  error: "错误",
  warn: "警告",
  info: "提示",
};

/** 纯文本报告（复制用）：按组归类，带行号。 */
export function formatReport(issues: CheckIssue[], docName: string): string {
  if (!issues.length) return `${docName}：体检通过，没有发现问题。`;
  const lines = [`${docName}：${issues.length} 个问题`, ""];
  const groups: CheckGroup[] = ["structure", "language", "links", "form", "style", "novel"];
  for (const group of groups) {
    const items = issues.filter((issue) => issue.group === group);
    if (!items.length) continue;
    lines.push(`【${GROUP_LABELS[group]}】`);
    for (const item of items) {
      const where = item.line === null ? "" : `（第 ${item.line} 行）`;
      lines.push(`- [${SEVERITY_LABELS[item.severity]}] ${item.message}${where}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

/** 小说档：章节字数差距。 */
function checkNovel(doc: Doc, out: CheckIssue[]): void {
  const chapters = doc.headings.filter((heading) => heading.level === 1);
  if (chapters.length < 2) return;
  const lengths: Array<{ heading: HeadingInfo; chars: number }> = [];
  for (let i = 0; i < chapters.length; i += 1) {
    const heading = chapters[i]!;
    const end = chapters[i + 1]?.from ?? doc.source.length;
    const chars = doc.source.slice(heading.to, end).replace(/\s+/g, "").length;
    lengths.push({ heading, chars });
  }
  const values = lengths.map((item) => item.chars).filter((value) => value > 0);
  if (values.length < 2) return;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min > 0 && max / min > 3) {
    const shortest = lengths.find((item) => item.chars === min)!;
    const longest = lengths.find((item) => item.chars === max)!;
    out.push({
      rule: "chapter-length",
      group: "novel",
      severity: "info",
      message: `章节长短差距过大：最短「${shortest.heading.text}」${min} 字，最长「${longest.heading.text}」${max} 字`,
      from: longest.heading.from,
      to: longest.heading.to,
      line: null,
    });
  }
}
