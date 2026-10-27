// Lucian UX/UI Prompt #028 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#028
// Lucian UX/UI Prompt #086 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#086
// Lucian UX/UI Prompt #233 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#233
import { useEffect, useRef, useState } from "react";

import type { ChatController } from "../ai/useChat";

/**
 * 右侧 AI 对话（可折叠、可拖宽）。
 *
 * composer 的规划参考 OpenChamber：运行状态在顶部一行，输入区居中，
 * 工具与模型收进底部一行，发送/停止是同一位置的圆形按钮。
 * 视觉取自 Lucian #028（自动增高）、#086（气泡/思考态）、#233（打字示例、圆形发送）。
 */

export interface ChatPanelProps {
  open: boolean;
  onToggle: () => void;
  controller: ChatController;
  /** 当前 agent / 模型，形如「OpenCode · model」。 */
  modelLabel: string;
  onOpenSettings: () => void;
  model: string;
  models: string[];
  modelsLoading: boolean;
  onModelChange: (model: string) => void;
  onRefreshModels: () => void;
  width: number;
  onWidthChange: (width: number) => void;
}

const SUGGESTIONS = [
  "把第二段改短一点，别丢数字",
  "给这一节补一个对比表格",
  "检查术语是否前后一致",
];

const MIN_WIDTH = 300;
const MAX_WIDTH = 520;

export function ChatPanel({
  open,
  onToggle,
  controller,
  modelLabel,
  onOpenSettings,
  model,
  models,
  modelsLoading,
  onModelChange,
  onRefreshModels,
  width,
  onWidthChange,
}: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const [ghost, setGhost] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const [agentName] = modelLabel.split(" · ");

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [controller.messages, controller.busy]);

  useEffect(() => {
    if (open) {
      const timer = window.setTimeout(() => inputRef.current?.focus(), 40);
      return () => window.clearTimeout(timer);
    }
    return undefined;
  }, [open]);

  // #028 的自动增高
  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const next = Math.min(160, Math.max(44, ta.scrollHeight));
    ta.style.height = `${next}px`;
    ta.style.overflowY = ta.scrollHeight > 160 ? "auto" : "hidden";
  }, [draft, open]);

  // #233 的打字示例：只在输入框为空时轮播
  useEffect(() => {
    if (!open || draft) {
      setGhost("");
      return undefined;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setGhost(SUGGESTIONS[0]!);
      return undefined;
    }
    let index = 0;
    let pos = 0;
    let dir = 1;
    let timer = 0;
    const tick = (): void => {
      const chars = Array.from(SUGGESTIONS[index]!);
      pos += dir;
      setGhost(chars.slice(0, Math.max(0, pos)).join(""));
      let wait = 55;
      if (dir > 0 && pos >= chars.length) {
        dir = -1;
        wait = 1700;
      } else if (dir < 0 && pos <= 0) {
        dir = 1;
        index = (index + 1) % SUGGESTIONS.length;
        wait = 420;
      } else if (dir < 0) {
        wait = 22;
      }
      timer = window.setTimeout(tick, wait);
    };
    timer = window.setTimeout(tick, 400);
    return () => window.clearTimeout(timer);
  }, [draft, open]);

  if (!open) {
    return (
      <button
        type="button"
        className="wr-chat-rail"
        onClick={onToggle}
        title="展开 AI 对话"
        aria-label="展开 AI 对话"
      >
        <span>AI</span>
      </button>
    );
  }

  const submit = (): void => {
    const text = draft.trim();
    if (!text || controller.busy) return;
    controller.send(text);
    setDraft("");
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    let next = startWidth;
    const move = (moveEvent: PointerEvent): void => {
      next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth - (moveEvent.clientX - startX)));
      onWidthChange(next);
    };
    const up = (): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <aside className="wr-chat" aria-label="AI 对话" style={{ width }}>
      <div
        className="wr-chat-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整对话宽度"
        title="拖动调整对话宽度"
        onPointerDown={startResize}
      />

      <header className="wr-chat-head">
        <span className="wr-chat-title">AI 对话</span>
        <span className="wr-chat-spacer" />
        <button
          type="button"
          className="wr-chat-agent"
          onClick={onOpenSettings}
          title={`${agentName ?? "Agent"} · 打开设置`}
        >
          {agentName || "未选择 Agent"}
        </button>
        <button
          type="button"
          className="wr-chat-icon"
          onClick={onToggle}
          title="收起面板"
          aria-label="收起面板"
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M6 3.5 10.5 8 6 12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </header>

      <div className="wr-chat-list" ref={listRef}>
        {controller.messages.length === 0 ? (
          <div className="wr-chat-empty">
            <span className="wr-chat-empty-av" aria-hidden="true" />
            <h3>让 AI 直接改这篇文档</h3>
            <p>选中一段会优先处理；改完一次可撤销。</p>
            <div className="wr-chat-sugs" role="group" aria-label="示例指令">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => {
                    setDraft(suggestion);
                    inputRef.current?.focus();
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
            <button type="button" className="wr-chat-settings" onClick={onOpenSettings}>
              打开 AI 设置
            </button>
          </div>
        ) : (
          controller.messages.map((message) => (
            <div key={message.id} className={`wr-chat-msg is-${message.role}`}>
              {message.role === "assistant" ? (
                <span className="wr-chat-av" aria-hidden="true" />
              ) : null}
              <div className="wr-chat-body">
                <div className="wr-chat-bubble">{message.content}</div>
                {message.summaries.length ? (
                  <ul className="wr-chat-summary">
                    {message.summaries.map((summary, index) => (
                      <li key={index}>{summary}</li>
                    ))}
                  </ul>
                ) : null}
                {message.edited ? (
                  <span className="wr-chat-edited">已写入文档 · 可撤销</span>
                ) : null}
              </div>
            </div>
          ))
        )}

        {controller.busy ? (
          <div className="wr-chat-msg is-assistant is-thinking">
            <span className="wr-chat-av is-gen" aria-hidden="true" />
            <div className="wr-chat-body">
              <span className="wr-chat-dots" aria-label="思考中">
                <i />
                <i />
                <i />
              </span>
              {controller.stage ? <span className="wr-chat-stage">{controller.stage}</span> : null}
            </div>
          </div>
        ) : null}

        {controller.error ? <div className="wr-chat-error">{controller.error}</div> : null}
      </div>

      <div className="wr-chat-compose">
        <div className="wr-chat-box">
          <div className="wr-chat-inner">
            {controller.busy ? (
              <div className="wr-chat-runbar">
                <span className="wr-chat-run-dot" aria-hidden="true" />
                <span className="wr-chat-run-text">{controller.stage || "运行中…"}</span>
                <button type="button" className="wr-chat-run-stop" onClick={controller.stop}>
                  停止
                </button>
              </div>
            ) : null}

            <div className="wr-chat-field">
              <textarea
                ref={inputRef}
                className="wr-chat-ta"
                value={draft}
                rows={2}
                aria-label="告诉 AI 要改什么"
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              {!draft ? (
                <span className="wr-chat-ghost" aria-hidden="true">
                  {ghost ? (
                    <>
                      {ghost}
                      <i />
                    </>
                  ) : (
                    "改写、扩写或提问（Ctrl+Enter 发送）"
                  )}
                </span>
              ) : null}
            </div>

            <div className="wr-chat-tools">
              <button
                type="button"
                className="wr-chat-tool"
                onClick={controller.clear}
                title="新对话"
                aria-label="新对话"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M8 3.2v9.6M3.2 8h9.6"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className="wr-chat-tool"
                onClick={onOpenSettings}
                title="AI 设置"
                aria-label="AI 设置"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <circle cx="8" cy="8" r="2.1" fill="none" stroke="currentColor" strokeWidth="1.4" />
                  <path
                    d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M12.4 3.6l-1 1M4.6 11.4l-1 1"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.3"
                    strokeLinecap="round"
                  />
                </svg>
              </button>

              <span className="wr-chat-spacer" />

              <select
                className="wr-chat-model"
                value={model}
                title={model || "使用 CLI 默认模型"}
                aria-label="模型"
                onChange={(event) => onModelChange(event.target.value)}
              >
                <option value="">默认模型</option>
                {models.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
                {model && !models.includes(model) ? (
                  <option value={model}>{model}（当前）</option>
                ) : null}
              </select>
              <button
                type="button"
                className="wr-chat-tool"
                onClick={onRefreshModels}
                disabled={modelsLoading}
                title="刷新模型列表"
                aria-label="刷新模型列表"
              >
                <svg viewBox="0 0 16 16" aria-hidden="true">
                  <path
                    d="M13 8a5 5 0 1 1-1.5-3.5M13 3v3h-3"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
              <button
                type="button"
                className={controller.busy ? "wr-chat-send is-stop" : "wr-chat-send"}
                disabled={!controller.busy && !draft.trim()}
                onClick={controller.busy ? controller.stop : submit}
                title={controller.busy ? "停止" : "发送（Ctrl+Enter）"}
                aria-label={controller.busy ? "停止" : "发送"}
              >
                {controller.busy ? (
                  <svg viewBox="0 0 14 14" aria-hidden="true">
                    <rect x="4" y="4" width="6" height="6" rx="1.2" fill="currentColor" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 14 14" aria-hidden="true">
                    <path
                      d="M7 12V2M2.5 6.5 7 2l4.5 4.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.9"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
