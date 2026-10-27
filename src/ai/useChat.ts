import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "../components/toast";
import { currentSettings } from "../storage/settings";
import { agentContext, cancelAgentRun, runAgentTask, selectedAgent } from "./agent-run";

/**
 * AI 对话（右侧面板）的编排。
 *
 * 只走选中的本机 agent（OpenCode / Claude Code）；模型、端点、Key 全由 agent 自己配置。
 * agent 在临时工作目录里改 document.md，结果回到这里：与原文比对、一次 dispatch、
 * 摘要 + 回滚撤销。没有 agent 时明确提示去设置里选一个。
 */

export interface ChatMessageView {
  id: number;
  role: "user" | "assistant";
  content: string;
  summaries: string[];
  edited: boolean;
}

export interface ChatSelection {
  from: number;
  to: number;
  text: string;
}

export interface UseChatOptions {
  getView: () => EditorView | null;
  getSelection: () => ChatSelection | null;
  /** 项目写作规范（WRITARA.md）。 */
  getProjectDoc: () => string;
  /** 切换文档时清空对话（避免把 A 文的上下文带到 B 文）。 */
  docKey: string;
  /** 「记住：…」写入长期记忆（由 App 写设置）。 */
  onRemember?: (text: string) => void;
}

export interface ChatController {
  messages: ChatMessageView[];
  busy: boolean;
  error: string | null;
  stage: string | null;
  send: (text: string) => void;
  stop: () => void;
  clear: () => void;
}

const MAX_HISTORY = 6;

export function useChat({
  getView,
  getSelection,
  getProjectDoc,
  docKey,
  onRemember,
}: UseChatOptions): ChatController {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const sequence = useRef(0);
  const runRef = useRef<string | null>(null);

  useEffect(() => {
    cancelAgentRun(runRef.current);
    runRef.current = null;
    setBusy(false);
    setStage(null);
    setMessages([]);
    setError(null);
  }, [docKey]);

  const stop = useCallback(() => {
    cancelAgentRun(runRef.current);
    runRef.current = null;
    setBusy(false);
    setStage(null);
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
    setError(null);
  }, []);

  const send = useCallback(
    (text: string) => {
      const prompt = text.trim();
      if (!prompt || busy) return;
      const view = getView();
      if (!view) return;

      const settings = currentSettings();
      const agent = selectedAgent(settings);
      if (!agent) {
        setError("请先在偏好设置 → AI 里选择一个 Agent（OpenCode / Claude Code）");
        return;
      }

      // 「记住：…」直接写记忆，不调用 agent
      const remember = /^记住[：:,，\s]+/.exec(prompt);
      if (remember && onRemember) {
        const memory = prompt.slice(remember[0].length).trim();
        if (memory) {
          onRemember(memory);
          const userMessage: ChatMessageView = {
            id: (sequence.current += 1),
            role: "user",
            content: prompt,
            summaries: [],
            edited: false,
          };
          setMessages((current) => [
            ...current,
            userMessage,
            {
              id: (sequence.current += 1),
              role: "assistant",
              content: `已记住：${memory}`,
              summaries: [],
              edited: false,
            },
          ]);
          return;
        }
      }

      const document = view.state.doc.toString();
      const selection = getSelection();
      setBusy(true);
      setError(null);
      setStage(`准备 ${agent.name}…`);

      const userMessage: ChatMessageView = {
        id: (sequence.current += 1),
        role: "user",
        content: prompt,
        summaries: [],
        edited: false,
      };
      setMessages((current) => [...current, userMessage]);

      const history = messages.slice(-MAX_HISTORY);
      const historyText = history
        .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
        .join("\n");
      const task = historyText
        ? `【最近对话】\n${historyText}\n\n【本次要求】\n${prompt}`
        : prompt;

      const finish = (content: string, after: string, summaries: string[]): void => {
        const edited = after !== document;
        if (edited) {
          view.dispatch({
            changes: minimalChange(document, after),
            selection: { anchor: Math.min(selection?.to ?? 0, view.state.doc.length) },
            scrollIntoView: true,
          });
          toast.undo(`AI 对话改了 ${summaries.length || 1} 处`, {
            label: "撤销",
            run: () => {
              const current = getView();
              if (!current) return;
              if (current.state.doc.toString() !== after) {
                toast.info("文档已经又改过，撤销请用 Ctrl+Z");
                return;
              }
              current.dispatch({
                changes: { from: 0, to: current.state.doc.length, insert: document },
                selection: { anchor: 0 },
              });
              current.focus();
            },
          });
        }
        setMessages((current) => [
          ...current,
          {
            id: (sequence.current += 1),
            role: "assistant",
            content,
            summaries,
            edited,
          },
        ]);
      };

      void (async () => {
        try {
          const result = await runAgentTask({
            agent,
            task,
            document,
            project: agentContext(settings, getProjectDoc()),
            selection: selection?.text,
            onStart: (runId) => {
              runRef.current = runId;
            },
            onStage: setStage,
          });
          if (!result.ok) throw new Error(result.error || "Agent 运行失败");
          const after = result.document || document;
          const summaries = result.changed
            ? [`${result.message || "已完成修改。"}（${Math.round(result.durationMs / 1000)}s）`]
            : [];
          finish(
            result.message || (result.changed ? "已完成修改。" : "没有改动文档。"),
            after,
            summaries,
          );
        } catch (cause) {
          setError(cause instanceof Error ? cause.message : "运行失败");
        } finally {
          runRef.current = null;
          setStage(null);
          setBusy(false);
        }
      })();
    },
    [busy, getProjectDoc, getSelection, getView, messages, onRemember],
  );

  return { messages, busy, error, stage, send, stop, clear };
}

/** 只替换真正变化的中段：撤销一步、对选区与折叠的扰动最小。 */
function minimalChange(before: string, after: string): { from: number; to: number; insert: string } {
  let start = 0;
  const maxStart = Math.min(before.length, after.length);
  while (start < maxStart && before[start] === after[start]) start += 1;
  let oldEnd = before.length;
  let newEnd = after.length;
  while (oldEnd > start && newEnd > start && before[oldEnd - 1] === after[newEnd - 1]) {
    oldEnd -= 1;
    newEnd -= 1;
  }
  return { from: start, to: oldEnd, insert: after.slice(start, newEnd) };
}
