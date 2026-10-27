import type { Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";

import { parseFrontMatter } from "../../markdown/frontmatter";
import { definitionMarker, parseDefinitionList } from "../../markdown/deflist";
import { emojiFor } from "../../markdown/emoji";
import { findSizedImagesInLine } from "../../markdown/image-size";
import { parseImageTarget } from "../../markdown/image-target";
import { isAttachmentTarget } from "../../markdown/attachment";
import { linesTouched, spanTouched } from "./focus";

/** 一段可被显示或隐藏的文档区间。 */
export interface Span {
  from: number;
  to: number;
}

/**
 * 分析结果：live preview 不直接产出 Decoration，
 * 而是先描述「要对哪些区间做什么」，方便在 node 环境下单测。
 */
export type LiveEdit =
  | { kind: "hide"; from: number; to: number }
  | { kind: "mark"; from: number; to: number; cls: string }
  | { kind: "line"; from: number; cls: string }
  /** 任务列表的 [ ] / [x]，替换成可点击的方框。 */
  | { kind: "task"; from: number; to: number; checked: boolean }
  /** 行内图片，替换成 <img>。 */
  | {
      kind: "image";
      from: number;
      to: number;
      src: string;
      alt: string;
      title: string;
      width?: number;
      height?: number;
    }
  /** 行内公式，替换成 KaTeX 渲染结果。 */
  | { kind: "math"; from: number; to: number; tex: string }
  /** 脚注引用，替换成上标数字。 */
  | { kind: "footnote"; from: number; to: number; id: string }
  /** 围栏代码块的语言标签（显示在代码块右上角）。 */
  | { kind: "lang"; from: number; to: number; text: string }
  /** 无序列表的 `-` / `*` / `+`，替换成圆点（与打印结果一致）。`depth` 决定 • ◦ ▪。 */
  | { kind: "bullet"; from: number; to: number; depth: number }
  /** 表情短代码 `:smile:`，替换成对应的 emoji（与打印一致）。 */
  | { kind: "emoji"; from: number; to: number; char: string };

/** 光标所在行会重新露出源码标记，与 Typora 行为一致。 */
const HIDDEN_MARKS = new Set([
  "HeaderMark",
  "EmphasisMark",
  "StrikethroughMark",
  "CodeMark",
  "LinkMark",
  "QuoteMark",
  "CodeInfo",
  "SubscriptMark",
  "SuperscriptMark",
  "HighlightMark",
  "MathMark",
]);

/** 与 Typora 一致：文档顶部的 YAML 块不参与正文渲染。 */
function frontMatterRange(doc: Text): { from: number; to: number } | null {
  if (doc.length < 8) return null;
  const head = doc.sliceString(0, Math.min(4000, doc.length));
  if (!head.startsWith("---")) return null;
  const front = parseFrontMatter(head);
  return front ? { from: front.from, to: front.to } : null;
}

const HEADING = /^(?:ATX|Setext)Heading([1-6])$/;

function unquote(text: string): string {
  const trimmed = text.trim();
  const first = trimmed[0];
  if ((first === '"' || first === "'") && trimmed.endsWith(first)) return trimmed.slice(1, -1);
  if (first === "(" && trimmed.endsWith(")")) return trimmed.slice(1, -1);
  return trimmed;
}

const MARK_NODES: Record<string, string> = {
  StrongEmphasis: "cm-md-strong",
  Emphasis: "cm-md-em",
  Strikethrough: "cm-md-strike",
  InlineCode: "cm-md-code",
  Link: "cm-md-link",
  Subscript: "cm-md-sub",
  Superscript: "cm-md-sup",
  Highlight: "cm-md-mark",
};

/** 行内标记：展开范围由它所属的那个 span 决定（见 focus.ts）。 */
const BLOCK_MARK_OWNERS = new Set(["FencedCode", "CodeBlock", "Blockquote"]);

/**
 * 一个标记（`**`、`` ` ``、`[`、围栏的 ``` 等）该不该露出。
 *
 * - 块级标记（标题、引用、围栏、语言名）：光标在这一行/块里就露出；
 * - 行内标记（强调、链接、行内代码……）：只看它所属的那一个 span，
 *   同一行里别处的标记保持隐藏。这是与 Typora 对齐的关键一步。
 */
function markRevealed(
  doc: Text,
  node: SyntaxNode,
  selection: readonly Span[],
): boolean {
  const owner = node.parent;
  if (!owner || BLOCK_MARK_OWNERS.has(owner.name) || HEADING.test(owner.name)) {
    return linesTouched(doc, node.from, node.to, selection);
  }
  return spanTouched(owner, selection);
}

/** 列表的嵌套层级：外层是 0。用来决定圆点符号（• ◦ ▪），与打印的 list-style-type 对齐。 */
function listDepth(node: SyntaxNode): number {
  let depth = 0;
  let current: SyntaxNode | null = node.parent;
  while (current) {
    if (current.name === "ListItem") depth += 1;
    current = current.parent;
  }
  return depth;
}

function end(edit: LiveEdit): number {
  return "to" in edit ? edit.to : edit.from;
}

function isInsideCode(tree: Tree, pos: number): boolean {
  let node = tree.resolveInner(pos, 1) as ReturnType<Tree["resolveInner"]> | null;
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock" || node.name === "InlineCode") {
      return true;
    }
    node = node.parent;
  }
  return false;
}

/**
 * @param visibleRanges 只分析视口内的区间（EditorView.visibleRanges）。
 * 纯函数：不读 DOM、不依赖 EditorView。
 */
export function collectEdits(
  doc: Text,
  tree: Tree,
  selection: readonly Span[],
  visibleRanges: readonly Span[],
): LiveEdit[] {
  const edits: LiveEdit[] = [];
  const seen = new Set<string>();
  const styledLines = new Set<number>();
  const front = frontMatterRange(doc);

  const push = (edit: LiveEdit) => {
    const key =
      edit.kind === "line" ? `line:${edit.from}:${edit.cls}` : `${edit.kind}:${edit.from}:${edit.to}:${"cls" in edit ? edit.cls : ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    edits.push(edit);
  };

  for (const visible of visibleRanges) {
    tree.iterate({
      from: visible.from,
      to: visible.to,
      enter: (node) => {
        if (front && node.from >= front.from && node.to <= front.to) return false;
        const heading = HEADING.exec(node.name);
        if (heading) {
          const line = doc.lineAt(node.from);
          if (!styledLines.has(line.from)) {
            styledLines.add(line.from);
            push({ kind: "line", from: line.from, cls: `cm-md-heading-${heading[1]}` });
          }
          return undefined;
        }

        if (node.name === "Blockquote") {
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(Math.max(node.from, node.to - 1)).number;
          for (let number = first; number <= last; number += 1) {
            const line = doc.line(number);
            if (styledLines.has(line.from)) continue;
            styledLines.add(line.from);
            push({ kind: "line", from: line.from, cls: "cm-md-quote" });
          }
          // 继续下钻，让子节点里的 QuoteMark 也被隐藏。
          return undefined;
        }

        // 定义列表（`术语` + 下一行起 `: 解释`）：CommonMark 里是普通段落，
        // 按行形状识别 —— 术语加粗、解释缩进、行首 `: ` 在非编辑态隐藏。
        if (node.name === "Paragraph" && node.node.parent?.name === "Document") {
          const definition = parseDefinitionList(doc.sliceString(node.from, node.to));
          if (definition) {
            const first = doc.lineAt(node.from).number;
            const last = doc.lineAt(node.to).number;
            const termLine = doc.line(first);
            if (!styledLines.has(termLine.from)) {
              styledLines.add(termLine.from);
              push({ kind: "line", from: termLine.from, cls: "cm-md-def-term" });
            }
            for (let number = first + 1; number <= last; number += 1) {
              const line = doc.line(number);
              if (!styledLines.has(line.from)) {
                styledLines.add(line.from);
                push({ kind: "line", from: line.from, cls: "cm-md-def-detail" });
              }
              const marker = definitionMarker(line.text);
              if (marker > 0 && !linesTouched(doc, line.from, line.from + marker, selection)) {
                push({ kind: "hide", from: line.from, to: line.from + marker });
              }
            }
            return undefined;
          }
        }

        if (node.name === "HorizontalRule") {
          styledLines.add(doc.lineAt(node.from).from);
          push({ kind: "line", from: doc.lineAt(node.from).from, cls: "cm-md-hr" });
          if (!linesTouched(doc, node.from, node.to, selection)) {
            push({ kind: "hide", from: node.from, to: node.to });
          }
          return undefined;
        }

        // 链接引用定义（`[ref]: url`）是元数据：打印/导出不输出，编辑器里按元信息弱化显示。
        // 不要整行隐藏：隐藏后那一行仍然是空行，前后两个空行会叠成一个明显的「洞」。
        if (node.name === "LinkReference") {
          const line = doc.lineAt(node.from);
          if (!styledLines.has(line.from)) {
            styledLines.add(line.from);
            push({ kind: "line", from: line.from, cls: "cm-md-meta" });
          }
          return false;
        }

        if (node.name === "FencedCode" || node.name === "CodeBlock") {
          const first = doc.lineAt(node.from).number;
          const last = doc.lineAt(Math.max(node.from, node.to - 1)).number;
          const closing = /^\s*(?:```|~~~)/.test(doc.line(last).text);

          if (node.name === "FencedCode") {
            const opening = doc.line(first);
            // 围栏行不显示 ``` 与语言名，只留一条与代码同色的空白行盒：
            // 它承担代码块的上下内边距，同时把行高留在 CodeMirror 的高度表里
            // （用 CSS padding 撑开会让高度表失真，见 editing-bugs.md #22）。
            push({ kind: "line", from: opening.from, cls: "cm-md-code-fence cm-md-code-fence-open" });
            if (closing) {
              push({
                kind: "line",
                from: doc.line(last).from,
                cls: "cm-md-code-fence cm-md-code-fence-close",
              });
            }

            const info = node.node.getChild("CodeInfo");
            const language = info ? doc.sliceString(info.from, info.to).trim().split(/\s+/)[0] ?? "" : "";
            // 没有语言名也放一个（只有复制按钮），与 Typora 一致。
            if (!linesTouched(doc, opening.from, opening.to, selection)) {
              push({ kind: "lang", from: opening.from, to: opening.from, text: language });
            }
          }

          // 围栏行自己铺底色（上一行/下一行），代码正文行只负责中间。
          for (let number = first + 1; number <= (closing ? last - 1 : last); number += 1) {
            const line = doc.line(number);
            if (styledLines.has(line.from)) continue;
            styledLines.add(line.from);
            push({ kind: "line", from: line.from, cls: "cm-md-codeblock" });
          }
          return undefined;
        }

        if (node.name === "ListItem") {
          const task = node.node.getChild("Task");
          const mark = node.node.getChild("ListMark");
          if (mark && !linesTouched(doc, mark.from, mark.to, selection)) {
            if (task) {
              // 任务项不显示圆点，只留方框。
              let to = mark.to;
              while (to < doc.length && doc.sliceString(to, to + 1) === " ") to += 1;
              push({ kind: "hide", from: mark.from, to });
            } else if (/^[-*+]$/.test(doc.sliceString(mark.from, mark.to))) {
              // 无序列表的标记换成圆点：编辑器与打印/导出的列表观感一致。
              // 层级决定符号（• ◦ ▪），与打印样式里的 list-style-type 一一对应。
              push({ kind: "bullet", from: mark.from, to: mark.to, depth: listDepth(node.node) });
            }
          }
          return undefined;
        }

        // 表情短代码 :smile: —— 打印会把它们变成 emoji，编辑器也得一样，
        // 否则同一段文字在屏幕上仍是 `:smile:`、纸面上却是笑脸。
        if (node.name === "Emoji") {
          if (!spanTouched(node, selection)) {
            const char = emojiFor(doc.sliceString(node.from + 1, node.to - 1));
            if (char) push({ kind: "emoji", from: node.from, to: node.to, char });
          }
          return undefined;
        }

        if (node.name === "TaskMarker") {
          if (!linesTouched(doc, node.from, node.to, selection)) {
            const raw = doc.sliceString(node.from, node.to);
            push({ kind: "task", from: node.from, to: node.to, checked: /\[[xX]\]/.test(raw) });
          }
          return undefined;
        }

        if (node.name === "Image") {
          if (!spanTouched(node, selection)) {
            const url = node.node.getChild("URL");
            const marks = node.node.getChildren("LinkMark");
            const altFrom = marks[0] ? marks[0].to : node.from;
            const altTo = marks[1] ? marks[1].from : (url ? url.from : node.to);
            const title = node.node.getChild("LinkTitle");
            if (url) {
              const target = parseImageTarget(doc.sliceString(url.from, url.to));
              push({
                kind: "image",
                from: node.from,
                to: node.to,
                src: target.src,
                alt: doc.sliceString(altFrom, altTo),
                title: title ? unquote(doc.sliceString(title.from, title.to)) : "",
                width: target.width,
                height: target.height,
              });
            }
          }
          // 整张图片已经处理；不要再给内部的标记单独做隐藏装饰（会重叠）。
          return false;
        }

        // 脚注引用：显示为上标数字，光标触到该节点时露出源码。
        if (node.name === "Link" && doc.sliceString(node.from, node.to).startsWith("[^")) {
          if (!spanTouched(node, selection)) {
            const raw = doc.sliceString(node.from, node.to);
            push({ kind: "footnote", from: node.from, to: node.to, id: raw.slice(2, -1) });
          }
          return false;
        }

        // 指向本地文件的链接（附件）额外加一层样式，显示成文件名胶囊。
        if (node.name === "Link") {
          const url = node.node.getChild("URL");
          if (url && isAttachmentTarget(doc.sliceString(url.from, url.to))) {
            push({ kind: "mark", from: node.from, to: node.to, cls: "cm-md-attachment" });
          }
        }

        if (node.name === "InlineMath") {
          if (!spanTouched(node, selection)) {
            push({
              kind: "math",
              from: node.from,
              to: node.to,
              tex: doc.sliceString(node.from + 1, node.to - 1),
            });
          }
          return false;
        }

        const isImageOrLinkUrl =
          node.name === "URL" && (node.node.parent?.name === "Link" || node.node.parent?.name === "Image");

        if (HIDDEN_MARKS.has(node.name) || isImageOrLinkUrl) {
          if (!markRevealed(doc, node.node, selection)) {
            let to = node.to;
            // 行首标记后的空格一并吞掉，否则行首会残留一个空格。
            if (node.name === "HeaderMark" || node.name === "QuoteMark") {
              while (to < doc.length && doc.sliceString(to, to + 1) === " ") to += 1;
            }
            push({ kind: "hide", from: node.from, to });
          }
          return undefined;
        }

        const cls = MARK_NODES[node.name];
        if (cls) push({ kind: "mark", from: node.from, to: node.to, cls });
        return undefined;
      },
    });
  }

  if (front) {
    for (const visible of visibleRanges) {
      if (visible.to < front.from) continue;
      const first = doc.lineAt(Math.max(visible.from, front.from)).number;
      const endPos = Math.max(front.from, Math.min(visible.to, front.to - 1));
      const last = doc.lineAt(endPos).number;
      for (let number = first; number <= last; number += 1) {
        push({ kind: "line", from: doc.line(number).from, cls: "cm-md-frontmatter" });
      }
    }
  }

  // 带尺寸的图片（![](... =宽x高)）不是合法的 Markdown 链接目标，解析器不会产出 Image 节点，
  // 所以这里按行补一次扫描。
  for (const visible of visibleRanges) {
    const firstLine = doc.lineAt(visible.from).number;
    const lastLine = doc.lineAt(Math.min(Math.max(visible.to, visible.from), doc.length)).number;
    for (let number = firstLine; number <= lastLine; number += 1) {
      const line = doc.line(number);
      if (!line.text.includes("![")) continue;

      for (const image of findSizedImagesInLine(line.text)) {
        const from = line.from + image.start;
        const to = line.from + image.end;
        if (spanTouched({ from, to }, selection)) continue;
        if (isInsideCode(tree, from)) continue;
        push({
          kind: "image",
          from,
          to,
          src: image.src,
          alt: image.alt,
          title: "",
          width: image.width,
          height: image.height,
        });
      }
    }
  }

  return edits.sort((a, b) => a.from - b.from || end(b) - end(a));
}
