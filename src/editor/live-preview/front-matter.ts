import type { Text } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";
import type { EditorState, Extension, Range } from "@codemirror/state";
import { StateField } from "@codemirror/state";

import { parseFrontMatter } from "../../markdown/frontmatter";
import { blockTouched } from "./focus";

/**
 * YAML Front Matter → 一行摘要（标题 / 日期 / 标签…）。
 *
 * 阅读态：折叠成一条「属性」摘要，点击即可展开回原始 YAML。
 * 编辑态（光标在块内）：保持原来的 `cm-md-frontmatter` 弱化源码（analyze.ts 负责）。
 *
 * 为什么单独一个 StateField：块级 replace 只能由状态层提供。
 * 只有文档以 `---` 开头时才解析，普通文档零开销。
 */

export interface FrontMatterEntry {
  key: string;
  value: string;
}

export interface FrontMatterBlock {
  from: number;
  to: number;
  entries: FrontMatterEntry[];
}

const ENTRY = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/;

/** 解析顶部 front matter 的键值；不是 front matter 时返回 null。 */
export function frontMatterOf(doc: Text): FrontMatterBlock | null {
  if (doc.length < 8) return null;
  const head = doc.sliceString(0, Math.min(4000, doc.length));
  if (!head.startsWith("---")) return null;

  const front = parseFrontMatter(head);
  if (!front) return null;

  const body = head.slice(0, front.to);
  const entries: FrontMatterEntry[] = [];
  for (const line of body.split(/\r?\n/).slice(1)) {
    if (/^---\s*$/.test(line)) break;
    const match = ENTRY.exec(line.trim());
    if (!match) continue;
    entries.push({ key: match[1] ?? "", value: (match[2] ?? "").trim().replace(/^['"]|['"]$/g, "") });
  }

  return { from: 0, to: front.to, entries };
}

/** 摘要里显示哪些键、按什么顺序；其余键收进「+N」。 */
const PREFERRED = ["title", "date", "author", "tags"];

export function summarize(front: FrontMatterBlock, limit = 3): { shown: FrontMatterEntry[]; rest: number } {
  const byKey = new Map(front.entries.map((entry) => [entry.key.toLowerCase(), entry]));
  const shown: FrontMatterEntry[] = [];
  for (const key of PREFERRED) {
    const hit = byKey.get(key);
    if (hit && hit.value) shown.push(hit);
    if (shown.length >= limit) break;
  }
  if (shown.length === 0) shown.push(...front.entries.filter((entry) => entry.value).slice(0, limit));
  return { shown, rest: Math.max(0, front.entries.length - shown.length) };
}

class FrontMatterWidget extends WidgetType {
  constructor(
    private readonly block: FrontMatterBlock,
    private readonly from: number,
  ) {
    super();
  }

  /** 一行摘要，估矮一点（真实高度由 CodeMirror 自己量）。 */
  get estimatedHeight(): number {
    return 28;
  }

  eq(other: FrontMatterWidget): boolean {
    return (
      other.from === this.from &&
      JSON.stringify(other.block.entries) === JSON.stringify(this.block.entries)
    );
  }

  toDOM(view: EditorView): HTMLElement {
    const host = document.createElement("div");
    host.className = "cm-md-meta-summary";

    const label = document.createElement("span");
    label.className = "cm-md-meta-label";
    label.textContent = "属性";
    host.appendChild(label);

    const { shown, rest } = summarize(this.block);
    if (shown.length === 0) {
      const empty = document.createElement("span");
      empty.className = "cm-md-meta-empty";
      empty.textContent = "（空）";
      host.appendChild(empty);
    }
    for (const entry of shown) {
      const chip = document.createElement("span");
      chip.className = "cm-md-meta-chip";
      const key = document.createElement("span");
      key.className = "cm-md-meta-key";
      key.textContent = entry.key;
      const value = document.createElement("span");
      value.className = "cm-md-meta-value";
      value.textContent = entry.value;
      chip.append(key, value);
      host.appendChild(chip);
    }
    if (rest > 0) {
      const more = document.createElement("span");
      more.className = "cm-md-meta-more";
      more.textContent = `+${rest}`;
      host.appendChild(more);
    }

    // 点摘要 = 把光标放进 front matter，露出原始 YAML（再点外面折叠回去）
    host.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      view.dispatch({
        selection: { anchor: this.from },
        effects: EditorView.scrollIntoView(this.from, { y: "nearest" }),
      });
      view.focus();
    });

    return host;
  }

  ignoreEvent(): boolean {
    return true;
  }
}

export function frontMatterBlocks(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return build(state);
    },
    update(value, tr) {
      if (!tr.docChanged && !tr.selection) return value;
      return build(tr.state);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}

function build(state: EditorState): DecorationSet {
  const block = frontMatterOf(state.doc);
  if (!block) return Decoration.none;
  // 光标在块里：保持可编辑的原始 YAML（analyze 给整行加了 cm-md-frontmatter）。
  // `to` 指向正文第一行开头，判断「在不在块里」要退一个字符，否则正文首行也算在内。
  if (blockTouched(state, block.from, Math.max(block.from, block.to - 1))) {
    return Decoration.none;
  }

  const ranges: Range<Decoration>[] = [
    Decoration.replace({
      widget: new FrontMatterWidget(block, block.from),
      block: true,
    }).range(block.from, block.to),
  ];
  return Decoration.set(ranges, true);
}
