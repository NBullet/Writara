/**
 * 反 AI 腔——规则层。
 *
 * AI 生成的中文文本有一种「腔」，其中一部分不靠模型也能认出来：空洞的过场词、
 * 正文里撒的 emoji、列表项清一色「**短语**：」的开头、结尾打圆场的段落。
 * 这里只认**话路形状**：纯文本变换、可单测，不配置 AI 端点也能用。
 * 需要语义级改写的部分属于 AI 动作（prompts.ts），不在这里。
 *
 * 判定保守：front matter、围栏代码、行内代码、链接地址一律不碰；
 * 「总之」这类词标题正文都可能合法出现，所以只对「正文行 + 句末标点之后」
 * 的位置出手，宁漏勿伤。
 *
 * 对外分两层：`scanSlop` 只出**区间**（编辑器据此标记），`applySlop` 才真正删除。
 * 「先标记、再应用」是这个模块的默认用法——用户看得见改了什么才决定。
 */

export interface SlopCounts {
  /** 句首过场话（总之 / 综上所述……）。 */
  phrase: number;
  /** 正文 emoji。 */
  emoji: number;
  /** 列表项的「**短语**：」开头。 */
  bold: number;
  /** 结尾打圆场段。 */
  tail: number;
}

export function newCounts(): SlopCounts {
  return { phrase: 0, emoji: 0, bold: 0, tail: 0 };
}

export type SlopKind = keyof SlopCounts;

export interface SlopHit {
  kind: SlopKind;
  /** 标记范围（编辑器高亮用，含两个 ** 这类成对记号）。 */
  from: number;
  to: number;
  /** 应用时真正删掉的区间：列表腔要删两段 `**`，所以可能不止一段。 */
  edits: Array<{ from: number; to: number }>;
  /** 片段原文，用于提示文案。 */
  text: string;
}

export interface SlopResult {
  text: string;
  counts: SlopCounts;
  /** 是否有实际修改。 */
  changed: boolean;
}

/** 句首过场话；只认行首或句末标点之后的位置。 */
const PASTE_PHRASES =
  "总之|综上所述?|总而言之|不言而喻|毫无疑问|众所周知|值得注意的是|需要注意的是|值得一提的是|由此可见|可以这样说";
const PASTE_RE = new RegExp(
  `(^|[。！？…])(?:${PASTE_PHRASES})(?:[，,、：:）)]\\s*|\\s+(?=\\S))`,
  "gu",
);

/** 列表腔：`- **短语**：`（短语 ≤ 14 字）→ 去掉加粗。 */
const LIST_BOLD_RE = /^(\s*(?:[-*+]|\d+[.、)])\s+)\*\*([^*\n]{1,14})\*\*\s*[:：]/;

/** 结尾打圆场段（只查全文最后一整段，把误伤范围锁死在收尾位置）。 */
const VALEDICTION_RE =
  /(?:希望这篇?|希望本[文档条章]|希望对(?:你|您|大家|各位|读者)(?:有所帮助|有帮助|有启发|有参考)|以上就是|祝你(?:写作|使用|操作)愉快|如果?(?:遇到)?了?(?:什么|任何)?(?:问题|疑问|意见|建议)[，,]?.{0,30}(?:留言|评论|交流|联系|指出))/;

/** 结尾段若是这些形状就不动：标题、列表、引用、表格、围栏。 */
const TAIL_UNSAFE = /^(?:#{1,6}\s|>|\||[-*+]\s|\d+[.、)]\s|```|~~~|<!--)/;

/** 复合 emoji 连成一串算一处；纯连接件不会单独出现。 */
function emojiSequence(): RegExp {
  // 用字符串拼出正则：字面量会让 no-misleading-character-class 误报
  // （量词 * 修饰整个中括号组，匹配的是完整序列而不是按码点拆开）。
  const base = "\\u{2600}-\\u{27BF}\\u{1F000}-\\u{1FAFF}\\u{2B00}-\\u{2BFF}";
  const joiner = "\\u{FE0F}\\u{200D}\\u{20E3}\\u{1F3FB}-\\u{1F3FF}";
  // eslint-disable-next-line no-misleading-character-class -- 量词修饰整个中括号组，按完整复合序列匹配
  return new RegExp(`(?:[${base}][${joiner}]*)+`, "gu");
}

const EMOJI_RE = emojiSequence();

/** 扫描全文，返回所有可清理的区间（不做修改）。 */
export function scanSlop(source: string): SlopHit[] {
  const hits: SlopHit[] = [];
  const table = regions(source);
  for (const region of table) {
    if (region.locked) continue;
    scanRegion(source, region.start, region.end, hits);
  }
  const tail = scanTail(source, hits, table);
  if (tail) hits.push(tail);
  hits.sort((a, b) => a.from - b.from);
  return hits;
}

/** 按命中区间删除；一次算完，调用方只用一次 dispatch。 */
export function applySlop(source: string, hits: SlopHit[]): string {
  const edits = hits
    .flatMap((hit) => hit.edits)
    .sort((a, b) => b.from - a.from);
  let text = source;
  let boundary = Number.POSITIVE_INFINITY;
  for (const edit of edits) {
    // 区间按 from 降序处理；后一个区间不能越过已处理区间的起点
    if (edit.to > boundary || edit.to <= edit.from) continue;
    text = text.slice(0, edit.from) + text.slice(edit.to);
    boundary = edit.from;
  }
  return text;
}

export function deAiSlop(source: string): SlopResult {
  const hits = scanSlop(source);
  const text = applySlop(source, hits);
  const counts = newCounts();
  for (const hit of hits) counts[hit.kind] += 1;
  return { text, counts, changed: text !== source };
}

interface Region {
  start: number;
  end: number;
  locked: boolean;
}

interface LineEntry {
  start: number;
  /** 行尾（不含换行符）。 */
  end: number;
  /** 含换行符的下一行起点。 */
  next: number;
  line: string;
}

function forEachLine(source: string): LineEntry[] {
  const out: LineEntry[] = [];
  let pos = 0;
  while (pos < source.length) {
    const newline = source.indexOf("\n", pos);
    const end = newline < 0 ? source.length : newline;
    const next = newline < 0 ? source.length : newline + 1;
    out.push({ start: pos, end, next, line: source.slice(pos, end) });
    pos = next;
  }
  return out;
}

/**
 * 受保护区：开头的 front matter，以及 ``` / ~~~ 围栏（打开行与闭合行都算）。
 * 区间必须精确到字符，标记层要直接拿它当装饰范围。
 */
function regions(source: string): Region[] {
  const out: Region[] = [];
  const push = (start: number, end: number, locked: boolean): void => {
    if (end <= start) return;
    const last = out.at(-1);
    if (last && last.locked === locked) last.end = end;
    else out.push({ start, end, locked });
  };

  const lines = forEachLine(source);
  let index = 0;

  // ── front matter（只认开头 ---，并且必须闭合）──
  if (lines[0] && /^---\s*$/.test(lines[0].line)) {
    let close = -1;
    for (let i = 1; i < lines.length; i += 1) {
      if (/^(?:---|\.\.\.)\s*$/.test(lines[i]!.line)) {
        close = i;
        break;
      }
    }
    if (close > 0) {
      push(0, lines[close]!.next, true);
      index = close + 1;
    }
  }

  let locked = false;
  let marker = "";
  let current = locked;
  let runStart = lines[index]?.start ?? source.length;

  const flush = (end: number): void => {
    if (end > runStart) push(runStart, end, current);
    runStart = end;
  };

  for (; index < lines.length; index += 1) {
    const entry = lines[index]!;
    let nextLocked: boolean;
    if (locked) {
      nextLocked = true;
      if (entry.line.trim().startsWith(marker)) {
        locked = false;
        marker = "";
      }
    } else {
      const open = /^\s*(`{3,}|~{3,})/.exec(entry.line);
      if (open) {
        locked = true;
        marker = (open[1] ?? "```")[0]!.repeat(3);
        nextLocked = true;
      } else {
        nextLocked = false;
      }
    }
    if (nextLocked !== current) {
      flush(entry.start);
      current = nextLocked;
    }
  }
  flush(source.length);
  return out;
}

/** 行内保护：`代码`、[文字](地址)、<https://…> 里的字符不参与规则。 */
interface InlinePart {
  start: number;
  end: number;
  locked: boolean;
}

function splitInline(line: string): InlinePart[] {
  const parts: InlinePart[] = [];
  const pattern = /(`[^`\n]+`)|(\[[^\]\n]*\]\([^)\n]+\))|(<https?:\/\/[^>\s]+>)/g;
  let last = 0;
  for (const match of line.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > last) parts.push({ start: last, end: start, locked: false });
    parts.push({ start, end: start + match[0]!.length, locked: true });
    last = start + match[0]!.length;
  }
  if (last < line.length) parts.push({ start: last, end: line.length, locked: false });
  return parts;
}

function scanRegion(source: string, start: number, end: number, hits: SlopHit[]): void {
  const lines = forEachLine(source.slice(start, end));
  for (const entry of lines) {
    const lineStart = start + entry.start;
    const line = entry.line;

    // 列表腔按整行判定（要同时知道前缀与顺序标记）；行内有受保护片段就跳过
    const parts = splitInline(line);
    const hasLocked = parts.some((part) => part.locked);
    if (!hasLocked) {
      const bold = listBoldHit(line, lineStart);
      if (bold) hits.push(bold);
    }

    for (const part of parts) {
      if (part.locked) continue;
      const from = lineStart + part.start;
      const text = line.slice(part.start, part.end);

      // 过场话：保留句末标点，删掉短语本身与它带出的标点/空格
      for (const match of text.matchAll(PASTE_RE)) {
        const before = match[1] ?? "";
        const startInPart = (match.index ?? 0) + before.length;
        hits.push({
          kind: "phrase",
          from: from + startInPart,
          to: from + (match.index ?? 0) + match[0].length,
          edits: [
            {
              from: from + startInPart,
              to: from + (match.index ?? 0) + match[0].length,
            },
          ],
          text: match[0].slice(before.length),
        });
      }

      // emoji：连续复合序列算一处
      for (const match of text.matchAll(EMOJI_RE)) {
        const matchFrom = from + (match.index ?? 0);
        hits.push({
          kind: "emoji",
          from: matchFrom,
          to: matchFrom + match[0].length,
          edits: [{ from: matchFrom, to: matchFrom + match[0].length }],
          text: match[0],
        });
      }
    }
  }
}

/** `- **短语**：` → 删两对 `**`（保留短语与冒号）。 */
function listBoldHit(line: string, lineStart: number): SlopHit | null {
  const match = LIST_BOLD_RE.exec(line);
  if (!match) return null;
  const prefix = match[1] ?? "";
  const phrase = match[2] ?? "";
  const open = lineStart + match.index + prefix.length;
  const close = open + 2 + phrase.length;
  return {
    kind: "bold",
    from: open,
    to: close + 2,
    edits: [
      { from: open, to: open + 2 },
      { from: close, to: close + 2 },
    ],
    text: `**${phrase}**`,
  };
}

/** 结尾打圆场段：全文最后一个非空文本段，不是标题 / 列表 / 表格等形状才动。 */
function scanTail(
  source: string,
  hits: SlopHit[],
  table: Region[],
): SlopHit | null {
  const trailing = source.match(/\n+$/)?.[0] ?? "";
  const bodyEnd = source.length - trailing.length;
  const body = source.slice(0, bodyEnd);
  const lastBreak = body.lastIndexOf("\n\n");
  const blockStart = lastBreak < 0 ? 0 : lastBreak + 2;
  const block = body.slice(blockStart);
  if (!block.trim()) return null;
  if (TAIL_UNSAFE.test(block)) return null;
  if (!VALEDICTION_RE.test(block)) return null;

  // 段内不能落在受保护区（例如以围栏结尾的文档）
  const region = table.find((item) => blockStart >= item.start && blockStart < item.end) ?? null;
  if (!region || region.locked || region.end < bodyEnd) return null;
  if (block.split("\n").some((line) => splitInline(line).some((part) => part.locked))) return null;
  // 同段的其它命中说明这一行已被处理过，避免标记重叠
  if (hits.some((hit) => hit.from >= blockStart && hit.from < bodyEnd)) return null;

  return {
    kind: "tail",
    from: blockStart,
    to: bodyEnd,
    edits: [{ from: blockStart, to: bodyEnd }],
    text: block,
  };
}
