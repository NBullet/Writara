/**
 * 行级 diff（AI 审阅浮层用）。
 *
 * 目标是「一眼看懂 AI 想改什么」，不是通用版本库：
 * 先掐掉公共前缀 / 后缀，剩下的规模小就做 LCS 对齐；规模太大就整体
 * 「删旧 + 插新」——两块分色呈现，依然可读。纯函数，可单测。
 */

export interface DiffLine {
  type: "same" | "ins" | "del";
  text: string;
}

/** 任一侧超过这个行数就放弃对齐，直接整块替换。 */
const ALIGN_LIMIT = 600;

export function diffLines(before: string, after: string): DiffLine[] {
  const a = before.split("\n");
  const b = after.split("\n");

  let low = 0;
  while (low < a.length && low < b.length && a[low] === b[low]) low += 1;
  let high = 0;
  while (
    high < a.length - low &&
    high < b.length - low &&
    a[a.length - 1 - high] === b[b.length - 1 - high]
  ) {
    high += 1;
  }

  const head = a.slice(0, low).map((text): DiffLine => ({ type: "same", text }));
  const tail = a.slice(a.length - high).map((text): DiffLine => ({ type: "same", text }));
  const oldMid = a.slice(low, a.length - high);
  const newMid = b.slice(low, b.length - high);

  if (oldMid.length === 0 && newMid.length === 0) return [...head, ...tail];
  if (oldMid.length > ALIGN_LIMIT || newMid.length > ALIGN_LIMIT) {
    return [
      ...head,
      ...oldMid.map((text): DiffLine => ({ type: "del", text })),
      ...newMid.map((text): DiffLine => ({ type: "ins", text })),
      ...tail,
    ];
  }
  return [...head, ...align(oldMid, newMid), ...tail];
}

/** 行级 diff 的对齐结果 → 折叠后的展示行（未改动的大段收起来）。 */
export type CollapsedDiffEntry =
  | { kind: "same"; text: string }
  | { kind: "ins" | "del"; text: string }
  | { kind: "collapse"; count: number };

export function collapseDiff(lines: DiffLine[], limit = 5): CollapsedDiffEntry[] {
  const out: CollapsedDiffEntry[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > limit * 2) {
      out.push({ kind: "collapse", count: run.length - 2 });
      out.push({ kind: "same", text: run.at(-1)! });
    } else {
      for (const text of run) out.push({ kind: "same", text });
    }
    run = [];
  };
  for (const line of lines) {
    if (line.type === "same") run.push(line.text);
    else {
      flush();
      out.push({ kind: line.type, text: line.text });
    }
  }
  flush();
  return out;
}

/** LCS 动态规划把中段对齐。 */
function align(a: string[], b: string[]): DiffLine[] {
  const rows = a.length + 1;
  const cols = b.length + 1;
  // 表里存路径长度；600×600 上限是 36 万格，可接受
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * cols + j] =
        a[i] === b[j]
          ? (table[(i + 1) * cols + j + 1] ?? 0) + 1
          : Math.max(table[(i + 1) * cols + j] ?? 0, table[i * cols + j + 1] ?? 0);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const left = a[i]!;
    const right = b[j]!;
    if (left === right) {
      out.push({ type: "same", text: left });
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * cols + j] ?? 0) >= (table[i * cols + (j + 1)] ?? 0)) {
      out.push({ type: "del", text: left });
      i += 1;
    } else {
      out.push({ type: "ins", text: right });
      j += 1;
    }
  }
  while (i < a.length) {
    out.push({ type: "del", text: a[i]! });
    i += 1;
  }
  while (j < b.length) {
    out.push({ type: "ins", text: b[j]! });
    j += 1;
  }
  return out;
}
