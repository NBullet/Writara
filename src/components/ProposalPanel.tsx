import { useEffect, useMemo, useState } from "react";

import { diffLines, type DiffLine } from "../ai/diff";
import type { Proposal } from "../ai/proposals";

/**
 * 提案审阅。
 *
 * 外部 agent 写进来的是「完整新内容」，所以这里展示的是目标文件当前内容
 * 与新内容的行级 diff。接受后：当前文档走一次 dispatch（可撤销），
 * 其他文件直接写盘（提示里说明）。提案文件本身保留，由用户决定是否删除。
 */

export interface ProposalView extends Proposal {
  /** 目标文件当前内容；null = 目标不在工作区。 */
  targetText: string | null;
  /** 是否就是当前打开的文档。 */
  isCurrent: boolean;
}

export interface ProposalPanelProps {
  items: ProposalView[] | null;
  onClose: () => void;
  onAccept: (view: ProposalView) => void;
  onReload: () => void;
}

export function ProposalPanel({ items, onClose, onAccept, onReload }: ProposalPanelProps) {
  const [selected, setSelected] = useState(0);
  const open = items !== null;

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    setSelected(0);
  }, [items]);

  const current = items?.[selected] ?? null;
  const diff = useMemo(
    () => (current ? collapseSame(diffLines(current.targetText ?? "", current.content)) : []),
    [current],
  );

  if (!items) return null;

  return (
    <section className="wr-prop" role="dialog" aria-label="待审提案">
      <header className="wr-check-head">
        <span className="wr-check-title">待审提案</span>
        <span className="wr-check-doc">{items.length} 份</span>
        <button type="button" className="wr-check-close" onClick={onClose} aria-label="关闭提案">
          ×
        </button>
      </header>

      {items.length === 0 ? (
        <div className="wr-prop-empty">
          没有待审提案。把文件放到 <code>.writara/proposals/</code>（格式见 AGENTS.md）。
        </div>
      ) : (
        <div className="wr-prop-body">
          <nav className="wr-prop-list" aria-label="提案列表">
            {items.map((item, index) => (
              <button
                key={item.path}
                type="button"
                className="wr-prop-item"
                aria-pressed={index === selected}
                onClick={() => setSelected(index)}
              >
                <span className="wr-prop-item-title">{item.title}</span>
                <span className="wr-prop-item-target">{item.target}</span>
              </button>
            ))}
          </nav>
          <div className="wr-prop-detail">
            {current ? (
              <>
                <p className="wr-prop-note">
                  {current.note || "（没有说明）"}
                  {current.targetText === null ? " · 目标不在工作区" : ""}
                  {current.isCurrent ? " · 当前文档" : ""}
                </p>
                <div className="wr-prop-diff">
                  {diff.map((entry, index) =>
                    entry.kind === "same" ? (
                      <div className="wr-ai-line same" key={index}>
                        {entry.text || " "}
                      </div>
                    ) : entry.kind === "collapse" ? (
                      <div className="wr-ai-collapsed" key={index}>
                        ── 未改动 {entry.count} 行 ──
                      </div>
                    ) : (
                      <div className={`wr-ai-line ${entry.kind}`} key={index}>
                        {entry.text || " "}
                      </div>
                    ),
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}

      <footer className="wr-ai-foot">
        <button
          type="button"
          className="wr-ai-btn primary"
          disabled={!current || current.targetText === null}
          onClick={() => current && onAccept(current)}
        >
          接受
        </button>
        <button type="button" className="wr-ai-btn" onClick={onReload}>
          重新扫描
        </button>
        <button type="button" className="wr-ai-btn" onClick={onClose}>
          关闭
        </button>
      </footer>
    </section>
  );
}

const SAME_LIMIT = 5;

type Entry =
  | { kind: "same"; text: string }
  | { kind: "ins" | "del"; text: string }
  | { kind: "collapse"; count: number };

function collapseSame(lines: DiffLine[]): Entry[] {
  const out: Entry[] = [];
  let run: string[] = [];
  const flush = (): void => {
    if (run.length > SAME_LIMIT * 2) {
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
