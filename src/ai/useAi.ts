import type { EditorView } from "@codemirror/view";
import { useCallback, useEffect, useRef, useState } from "react";

import type { AiActionEventDetail } from "../editor/ai-toolbar";
import { AI_ACTION_EVENT } from "../editor/ai-toolbar";
import { clearSlopMarks, setSlopMarks } from "../editor/slop-marks";
import type { AiReviewState } from "../components/AiReview";
import { askConfirm } from "../components/confirm";
import { showToast, toast } from "../components/toast";
import { currentSettings } from "../storage/settings";
import { applySlop, scanSlop } from "./antislop";
import { briefToPrompt, type WritingBrief } from "./brief";
import { agentContext, cancelAgentRun, runAgentTask, selectedAgent } from "./agent-run";
import { AI_ACTIONS, taskForAction, type AiActionId } from "./prompts";

/**
 * AI 动作的编排层（React 一侧）。
 *
 * 只走选中的本机 agent：动作被翻译成一份「工作区任务」，agent 在临时目录里改
 * document.md，结果回到审阅浮层（全篇 diff），用户点「替换」才一次 dispatch。
 * 端点 / Key / 模型都归 agent 自己配置，这里不保存任何凭据。
 */

export interface UseAiOptions {
  getView: () => EditorView | null;
  getDoc: () => string;
  /** 当前文档的标题结构 → 初稿提纲文本；空字符串表示没有标题。 */
  outlinePrompt: () => string;
  /** 已加载的项目写作规范（WRITARA.md）；没有时为空串。 */
  getProjectDoc: () => string;
}

export interface AiController {
  panel: AiReviewState | null;
  close: () => void;
  adopt: () => void;
  stop: () => void;
  startDraft: (prompt: string) => void;
  /** 任务单 → 完整初稿（走 agent）。 */
  startPipeline: (options: { brief: WritingBrief; project: string; replace: boolean }) => void;
  runCommand: (id: string) => void;
}

const COMMAND_TO_ACTION: Record<string, AiActionId> = {
  "ai-polish": "polish",
  "ai-expand": "expand",
  "ai-shorten": "shorten",
  "ai-deslop": "deslop",
  "ai-continue": "continue",
  "ai-proofread": "proofread",
  "ai-review": "review",
  "ai-table": "table",
  "ai-chart": "chart",
  "ai-formula": "formula",
};

const ACTION_IDS = new Set(Object.values(COMMAND_TO_ACTION));

export function useAi({ getView, getDoc, outlinePrompt, getProjectDoc }: UseAiOptions): AiController {
  const [panel, setPanel] = useState<AiReviewState | null>(null);
  const panelRef = useRef<AiReviewState | null>(null);
  panelRef.current = panel;
  /** 待写回的文档区间；null = 只读报告。 */
  const pendingRef = useRef<{ from: number; to: number } | null>(null);
  const runRef = useRef<string | null>(null);

  const close = useCallback(() => {
    cancelAgentRun(runRef.current);
    runRef.current = null;
    pendingRef.current = null;
    setPanel(null);
  }, []);

  useEffect(() => close, [close]);

  const stop = useCallback(() => {
    cancelAgentRun(runRef.current);
    runRef.current = null;
    pendingRef.current = null;
    setPanel(null);
  }, []);

  const anchorFor = useCallback(
    (from: number, to: number): AiReviewState["anchor"] | null => {
      const view = getView();
      if (!view || window.innerWidth < 900) return null;
      const head = view.coordsAtPos(from);
      if (!head) return null;
      const tail = view.coordsAtPos(to);
      return { left: head.left, top: head.top, bottom: tail ? tail.bottom : head.bottom };
    },
    [getView],
  );

  const applyResult = useCallback(
    (state: AiReviewState, target: { from: number; to: number }) => {
      const view = getView();
      if (!view) return;
      if (state.output.trim() === state.source.trim()) {
        toast.info("Agent 没有给出不同的内容");
        return;
      }
      view.dispatch({
        changes: { from: target.from, to: target.to, insert: state.output },
        selection: { anchor: target.from + state.output.length },
        scrollIntoView: true,
      });
      view.focus();
      close();
    },
    [close, getView],
  );

  const adopt = useCallback(() => {
    const state = panelRef.current;
    const target = pendingRef.current;
    if (state && target) applyResult(state, target);
  }, [applyResult]);

  /**
   * 跑一次 agent 任务。
   *
   * 改写型：source = 当前全文，结果为新全文，adopt 时全篇替换（一次 dispatch）。
   * 报告型：只取回复文本，不改文档。
   */
  const execute = useCallback(
    (options: {
      action: AiActionId;
      task: string;
      replaces: boolean;
      report?: boolean;
      range?: { from: number; to: number } | null;
    }) => {
      const view = getView();
      if (!view) return;
      const settings = currentSettings();
      const agent = selectedAgent(settings);
      if (!agent) {
        toast.error("请先在偏好设置 → AI 里选择一个 Agent（OpenCode / Claude Code）");
        return;
      }

      const doc = view.state.doc.toString();
      const selectionText = options.range
        ? view.state.sliceDoc(options.range.from, options.range.to)
        : "";
      pendingRef.current = options.replaces ? { from: 0, to: doc.length } : null;
      setPanel({
        action: options.action,
        status: "streaming",
        source: options.replaces ? doc : "",
        output: "",
        error: null,
        anchor: options.range ? anchorFor(options.range.from, options.range.to) : null,
        stage: `准备 ${agent.name}…`,
      });

      void (async () => {
        try {
          const result = await runAgentTask({
            agent,
            task: options.task,
            document: doc,
            project: agentContext(settings, getProjectDoc()),
            selection: selectionText,
            onStart: (runId) => {
              runRef.current = runId;
            },
            onStage: (stage) => setPanel((current) => (current ? { ...current, stage } : current)),
          });
          runRef.current = null;
          if (!result.ok) throw new Error(result.error || "Agent 运行失败");

          if (options.report) {
            pendingRef.current = null;
            setPanel((current) =>
              current
                ? {
                    ...current,
                    status: "done",
                    output: result.message || "（没有返回意见）",
                    source: "",
                    stage: undefined,
                  }
                : current,
            );
            return;
          }

          const next = result.document || doc;
          pendingRef.current = { from: 0, to: doc.length };
          setPanel((current) =>
            current
              ? { ...current, status: "done", output: next, source: doc, stage: undefined }
              : current,
          );
          if (!result.changed) toast.info("Agent 没有改动文档");
        } catch (cause) {
          runRef.current = null;
          setPanel((current) =>
            current && current.status === "streaming"
              ? {
                  ...current,
                  status: "error",
                  error: cause instanceof Error ? cause.message : "运行失败",
                }
              : current,
          );
        }
      })();
    },
    [anchorFor, getProjectDoc, getView],
  );

  /** 选区（无选区取当前行）。 */
  const selectionOrBlock = useCallback((): { from: number; to: number } | null => {
    const view = getView();
    if (!view) return null;
    const selection = view.state.selection.main;
    if (!selection.empty) return { from: selection.from, to: selection.to };
    const line = view.state.doc.lineAt(selection.head);
    return line.text.trim() ? { from: line.from, to: line.to } : null;
  }, [getView]);

  const startSelectionAction = useCallback(
    (action: AiActionId, range?: { from: number; to: number }) => {
      const view = getView();
      if (!view) return;
      const rect = range ?? selectionOrBlock();
      if (!rect) {
        toast.info("没有可处理的文字：先选中一段");
        return;
      }
      const text = view.state.sliceDoc(rect.from, rect.to);
      if (!text.trim()) {
        toast.info("没有可处理的文字：先选中一段");
        return;
      }
      execute({
        action,
        task: `${taskForAction(action)}\n\n【用户选中的内容】\n${text}\n\n只修改选中的这部分内容，其他部分保持原样。`,
        replaces: true,
        range: rect,
      });
    },
    [execute, getView, selectionOrBlock],
  );

  const startContinue = useCallback(() => {
    const view = getView();
    if (!view) return;
    const pos = view.state.selection.main.to;
    const before = view.state.doc.sliceString(0, pos).slice(-1200);
    execute({
      action: "continue",
      task: `${taskForAction("continue")}\n\n【光标前的内容】\n${before}\n\n在文档末尾继续写，不要改动已有内容。`,
      replaces: true,
    });
  }, [execute, getView]);

  const startDocAction = useCallback(
    (action: AiActionId) => {
      const doc = getDoc();
      if (!doc.trim()) {
        toast.info("文档是空的");
        return;
      }
      if (action === "review") {
        execute({
          action,
          task: `${taskForAction("review")}\n\n不要修改 document.md；把审读意见写在回复里。`,
          replaces: false,
          report: true,
        });
        return;
      }
      execute({
        action,
        task: `${taskForAction(action)}\n\n把修改后的全文写入 document.md。`,
        replaces: true,
      });
    },
    [execute, getDoc],
  );

  const startDraft = useCallback(
    async (prompt: string) => {
      const view = getView();
      if (!view) return;
      if (view.state.doc.toString().trim()) {
        const answer = await askConfirm({
          title: "AI 初稿会替换当前内容",
          message: "初稿写入后仍可在审阅浮层里放弃。继续吗？",
          actions: [{ id: "replace", label: "继续生成", primary: true }],
          cancelLabel: "取消",
        });
        if (answer !== "replace") return;
      }
      execute({
        action: "draft",
        task: `${taskForAction("draft")}\n\n【用户提纲】\n${prompt}\n\n写出完整初稿，替换 document.md 的全部内容。`,
        replaces: true,
      });
    },
    [execute, getView],
  );

  const startPipeline = useCallback(
    (options: { brief: WritingBrief; project: string; replace: boolean }) => {
      execute({
        action: "draft",
        task: `${briefToPrompt(options.brief)}\n\n按任务单写出完整初稿，替换 document.md 的全部内容。`,
        replaces: true,
      });
    },
    [execute],
  );

  const startDraftEntry = useCallback(
    (viaOutline = false) => {
      const prefill = viaOutline ? outlinePrompt() : "";
      setPanel({
        action: "draft",
        status: "input",
        source: "",
        output: "",
        error: null,
        anchor: null,
        prefill: prefill || undefined,
      });
      if (viaOutline && !prefill) {
        toast.info("当前文档没有标题，先在面板里写提纲");
      }
    },
    [outlinePrompt],
  );

  /** 反 AI 腔·规则层：先标记，用户在提示条里点「全部清理」才动字。 */
  const applyRulesSlop = useCallback(() => {
    const view = getView();
    if (!view) return;
    const original = view.state.doc.toString();
    const hits = scanSlop(original);
    if (!hits.length) {
      toast.info("没有发现 AI 腔");
      return;
    }
    const cleaned = applySlop(original, hits);
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: cleaned },
      effects: clearSlopMarks.of(null),
      selection: { anchor: 0 },
    });
    view.focus();
    toast.undo(`已清理 ${hits.length} 处（过场话 / emoji / 加粗 / 收尾）`, {
      label: "撤销",
      run: () => {
        const current = getView();
        if (!current) return;
        if (current.state.doc.toString() !== cleaned) {
          toast.info("文档已经又改过，撤销请用 Ctrl+Z");
          return;
        }
        current.dispatch({
          changes: { from: 0, to: current.state.doc.length, insert: original },
          selection: { anchor: 0 },
        });
        current.focus();
      },
    });
  }, [getView]);

  const scanRulesSlop = useCallback(() => {
    const view = getView();
    if (!view) return;
    const hits = scanSlop(view.state.doc.toString());
    if (!hits.length) {
      toast.info("没有发现 AI 腔");
      return;
    }
    view.dispatch({ effects: setSlopMarks.of(hits) });
    view.focus();
    showToast({
      message: `标记了 ${hits.length} 处 AI 腔，悬停看类型`,
      action: { label: "全部清理", run: () => applyRulesSlop() },
      duration: 12000,
    });
  }, [applyRulesSlop, getView]);

  const clearRulesSlop = useCallback(() => {
    const view = getView();
    if (!view) return;
    view.dispatch({ effects: clearSlopMarks.of(null) });
    toast.info("已清除 AI 腔标记");
  }, [getView]);

  const runCommand = useCallback(
    (id: string) => {
      if (id === "ai-draft") {
        startDraftEntry();
        return;
      }
      if (id === "ai-draft-outline") {
        startDraftEntry(true);
        return;
      }
      if (id === "ai-antislop-rules") {
        scanRulesSlop();
        return;
      }
      if (id === "ai-antislop-apply") {
        applyRulesSlop();
        return;
      }
      if (id === "ai-antislop-clear") {
        clearRulesSlop();
        return;
      }
      const action = COMMAND_TO_ACTION[id];
      if (!action) return;
      if (action === "continue") {
        startContinue();
        return;
      }
      if (AI_ACTIONS[action].scope === "doc") {
        startDocAction(action);
        return;
      }
      startSelectionAction(action);
    },
    [
      applyRulesSlop,
      clearRulesSlop,
      scanRulesSlop,
      startContinue,
      startDocAction,
      startDraftEntry,
      startSelectionAction,
    ],
  );

  // 选区浮条（编辑器插件）经 CustomEvent 冒泡到 window 进来
  useEffect(() => {
    const listener = (event: Event): void => {
      const detail = (event as CustomEvent<AiActionEventDetail>).detail;
      if (!detail?.action) return;
      const action = detail.action as AiActionId;
      if (!ACTION_IDS.has(action)) return;
      const view = getView();
      let range: { from: number; to: number } | undefined;
      if (view && detail.to <= view.state.doc.length && detail.from < detail.to) {
        range = { from: detail.from, to: detail.to };
      }
      startSelectionAction(action, range);
    };
    window.addEventListener(AI_ACTION_EVENT, listener);
    return () => window.removeEventListener(AI_ACTION_EVENT, listener);
  }, [getView, startSelectionAction]);

  return {
    panel,
    close,
    adopt,
    stop,
    startDraft: (prompt: string) => void startDraft(prompt),
    startPipeline,
    runCommand,
  };
}
