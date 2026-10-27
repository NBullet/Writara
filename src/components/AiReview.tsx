import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { collapseDiff, diffLines } from "../ai/diff";
import { AI_ACTIONS, type AiActionId } from "../ai/prompts";

/**
 * AI 审阅浮层。
 *
 * 流式结果**只落在这一层**，不写入文档：替换型动作完成后展示行级 diff，
 * 用户点「替换」才生成一次 dispatch —— 从机制上挡住 IME 组合期的全部风险
 * （AGENTS.md 既有约束），也让 AI 改动天然是一次可撤销的普通编辑。
 * 定位在选区上方（与图片浮条同一套 fixed + 钳位手法），全文级动作则居中。
 */

export interface AiReviewState {
  action: AiActionId;
  /** input：初稿等用户输入；streaming：生成中；done：完成；error：已失败。 */
  status: "input" | "streaming" | "done" | "error";
  /** 被替换的原文（替换型）；插入型 / 报告型为空。 */
  source: string;
  output: string;
  error: string | null;
  /** 选区在视口里的位置；null = 居中大面板。 */
  anchor: { left: number; top: number; bottom: number } | null;
  /** 初稿输入阶段的预填内容（例如「按当前标题结构」）。 */
  prefill?: string;
  /** 分节生成时的阶段提示（「正在写第 2/6 节…」）。 */
  stage?: string;
}

export interface AiReviewProps {
  state: AiReviewState | null;
  onAdopt: () => void;
  onClose: () => void;
  onStop: () => void;
  onDraftStart: (prompt: string) => void;
  /** 当前文档的标题结构（空字符串 = 没有标题）。 */
  onOutlineText: () => string;
}

function isReport(action: AiActionId): boolean {
  // 插入型与替换型都走 diff 呈现；审稿意见是唯一只读的文字面板
  const meta = AI_ACTIONS[action];
  return !meta.replaces && action === "review";
}

/** 挂点：<body> 尾部的固定层，位置 fixed 不受编辑器滚动容器影响。 */
function useAiRoot(): HTMLElement | null {
  const [root, setRoot] = useState<HTMLElement | null>(() => document.getElementById("wr-ai-root"));
  useEffect(() => {
    const existing = document.getElementById("wr-ai-root");
    if (existing) {
      setRoot(existing);
      return undefined;
    }
    const created = document.createElement("div");
    created.id = "wr-ai-root";
    document.body.appendChild(created);
    setRoot(created);
    return () => undefined;
  }, []);
  return root;
}

export function AiReview({
  state,
  onAdopt,
  onClose,
  onStop,
  onDraftStart,
  onOutlineText,
}: AiReviewProps) {
  const [draft, setDraft] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const portal = useAiRoot();
  useEffect(() => {
    if (state?.status === "input") {
      // 每次进入输入态都从 prefill 起步（「按大纲」入口会带内容）
      setDraft(state.prefill ?? "");
      const timer = window.setTimeout(() => textRef.current?.focus(), 30);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [state?.status, state?.prefill]);

  useEffect(() => {
    if (!state) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (state.status === "streaming") onStop();
      else onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [state, onClose, onStop]);

  if (!state || !portal) return null;

  const meta = AI_ACTIONS[state.action];
  const streaming = state.status === "streaming";

  const position = state.anchor
    ? {
        left: Math.max(8, Math.min(state.anchor.left, window.innerWidth - PANEL_WIDTH - 12)),
        top: state.anchor.top - PANEL_MARGIN >= 8 ? state.anchor.top - PANEL_MARGIN : state.anchor.bottom + PANEL_MARGIN,
        right: undefined as number | undefined,
        bottom: undefined as number | undefined,
      }
    : null;

  return createPortal(
    <div
      className={`wr-ai-panel${position ? " wr-ai-anchored" : " wr-ai-center"}`}
      style={position ? { left: position.left, top: position.top } : undefined}
      role="dialog"
      aria-label={`AI ${meta.label}`}
    >
      <header className="wr-ai-head">
        <span className="wr-ai-title">{meta.label}</span>
        <span className="wr-ai-status">
          {streaming
            ? (state.stage ?? "生成中…")
            : state.status === "done"
              ? "完成 · 请审阅"
              : state.status === "error"
                ? "出错了"
                : ""}
        </span>
      </header>

      {state.status === "input" ? (
        <div className="wr-ai-input">
          <textarea
            ref={textRef}
            value={draft}
            placeholder="描述文章主题或粘一段提纲（一至四级结构都可以）"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                if (draft.trim()) onDraftStart(draft.trim());
              }
            }}
            rows={5}
          />
          <div className="wr-ai-actions">
            <button
              type="button"
              className="wr-ai-btn wr-ai-outline"
              title="用当前文档的标题结构作为提纲"
              onClick={() => {
                const outline = onOutlineText();
                if (!outline) return;
                setDraft((current) => (current.trim() ? `${current.trim()}\n\n${outline}` : outline));
              }}
            >
              用当前标题结构
            </button>
            <span className="wr-ai-spacer" />
            <button
              type="button"
              className="wr-ai-btn primary"
              disabled={!draft.trim()}
              onClick={() => onDraftStart(draft.trim())}
            >
              开始生成
            </button>
            <button type="button" className="wr-ai-btn" onClick={onClose}>
              取消
            </button>
          </div>
        </div>
      ) : isReport(state.action) ? (
        <div className="wr-ai-report">{state.output || (state.error ?? "")}</div>
      ) : (
        <div className="wr-ai-body">
          {renderDiff(state)}
          {state.error ? <div className="wr-ai-error">{state.error}</div> : null}
        </div>
      )}

      {state.status !== "input" ? (
        <footer className="wr-ai-foot">
          {state.status === "streaming" ? (
            <button type="button" className="wr-ai-btn" onClick={onStop}>
              停止
            </button>
          ) : state.status === "done" ? (
            <>
              {isReport(state.action) ? (
                <>
                  <button
                    type="button"
                    className="wr-ai-btn"
                    onClick={() => void navigator.clipboard?.writeText(state.output)}
                  >
                    复制意见
                  </button>
                  <button type="button" className="wr-ai-btn primary" onClick={onClose}>
                    关闭
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="wr-ai-btn primary" onClick={onAdopt}>
                    {state.source.trim() ? "替换" : "插入"}
                  </button>
                  <button type="button" className="wr-ai-btn" onClick={onClose}>
                    放弃
                  </button>
                </>
              )}
            </>
          ) : null}
        </footer>
      ) : null}
    </div>,
    portal,
  );
}

const PANEL_WIDTH = 620;
const PANEL_MARGIN = 8;

function renderDiff(state: AiReviewState) {
  if (state.status === "streaming") {
    return (
      <div className="wr-ai-stream">
        {state.output || state.stage || "已发送，等待第一段…"}
      </div>
    );
  }
  const lines = diffLines(state.source, state.output);
  const collapsed = collapseDiff(lines);
  return (
    <div className="wr-ai-diff">
      {collapsed.map((entry, index) =>
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
  );
}
