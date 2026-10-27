import type { EditorView } from "@codemirror/view";
import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { displayShortcut } from "./commands/menu";
import { EDITOR_COMMANDS } from "./commands/editor-commands";
import { createMenus, EMOJI, type MenuState } from "./commands/menus";
import { comboFromEvent } from "./commands/menu";
import { EDITOR_NATIVE, SHORTCUTS } from "./commands/shortcuts";
import { CommandPalette } from "./components/CommandPalette";
import type { PaletteCommand } from "./components/command-match";
import { askConfirm, registerConfirm, type ConfirmRequest } from "./components/confirm";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { ContextMenu, type ContextEntry } from "./components/ContextMenu";
import { FindBar } from "./components/FindBar";
import { HelpDialog } from "./components/HelpDialog";
import { SaveIcon, SearchIcon, SlidersIcon, ExportIcon } from "./components/icons";
import { MarkdownEditor, type MarkdownEditorHandle } from "./components/MarkdownEditor";
import { MenuBar } from "./components/MenuBar";
import { SearchDialog } from "./components/SearchDialog";
import { Preferences, type PreferenceAction } from "./components/Preferences";
import { ProjectDialog, type ProjectDialogRequest, type ProjectDraft } from "./components/ProjectDialog";
import {
  ProjectSettings,
  type ProjectSettingsRequest,
} from "./components/ProjectSettings";
import {
  ProjectAiDialog,
  type ProjectAiChange,
  type ProjectAiRequest,
} from "./components/ProjectAiDialog";
import { PromptDialog, type PromptRequest } from "./components/PromptDialog";
import { Sidebar, type SidebarMode } from "./components/Sidebar";
import { Toaster } from "./components/Toaster";
import { BusyOverlay } from "./components/BusyOverlay";
import { UpdateBanner } from "./components/UpdateBanner";
import { toast } from "./components/toast";
import { useUpdater } from "./updates/useUpdater";
import { useDocument } from "./document/useDocument";
import { AiReview } from "./components/AiReview";
import { BriefPanel } from "./components/BriefPanel";
import { CheckReportPanel, type CheckReport } from "./components/CheckReport";
import { ProposalPanel, type ProposalView } from "./components/ProposalPanel";
import { ChatPanel } from "./components/ChatPanel";
import { useChat, type ChatSelection } from "./ai/useChat";
import { useAi } from "./ai/useAi";
import { clipProjectText, pickProjectFile } from "./ai/project";
import { formatReport, runChecks, type CheckIssue, type CheckProfile } from "./ai/checks";
import { loadBrief, saveBrief, type WritingBrief } from "./ai/brief";
import { parseProposal, proposalFiles } from "./ai/proposals";
import { runProjectTask } from "./ai/project-run";
import { createProjectFiles, writeProject } from "./project/file";
import { createManifest, type ProjectManifest } from "./project/manifest";
import { orderedDocuments } from "./project/order";
import { PROJECT_MANIFEST_PATH } from "./workspace/config";
import { copyAs, cutSelection, pasteText } from "./editor/clipboard";
import * as cmd from "./editor/commands";
import { findMatches, replacementFor, type FindMatch } from "./editor/find";
import { clearFindMatches, setFindMatches } from "./editor/find-highlight";
import { insertImages } from "./editor/image-drop";
import { insertAttachments } from "./editor/attachment";
import { dispatchAiAction } from "./editor/ai-toolbar";
import { runTableCommand, tableCommandList, tableContextAt } from "./editor/table-menu";
import {
  configurePrint,
  downloadHtml,
  downloadHtmlText,
  exportPng,
  isPrintPrepared,
  preparePrintView,
  printMarkdown,
  setCustomCss,
  updatePrintView,
} from "./export/print";
import {
  bundleIndexHtml,
  chapterDocumentHtml,
  chapterFileName,
  renderProject,
  type ProjectChapterInput,
} from "./export/project";
import { applyLineEnding, detectLineEnding, normalizeLineEndings } from "./io/line-endings";
import { collectOutline } from "./markdown/outline";
import { parseTableSize, TABLE_LIMITS } from "./markdown/table";
import { exportPdf, exportHtmlAsPdf, previewPdf } from "./export/pdf";
import { exportWithPandoc } from "./export/pandoc";
import { SAMPLE_DOC } from "./sample";
import { markSplashReady } from "./startup-splash";
import { applySettings, loadSettings, saveSettings, type Settings, type StyleName } from "./storage/settings";
import { clearRecent, forgetRecent, listRecent, type RecentFile } from "./storage/recent";
import { loadDraft } from "./storage/draft";
import { describeFileError } from "./io/file-system";
import { formatLabel, isDefaultFormat } from "./io/encoding";
import { setImageResolver } from "./io/image-resolver";
import { setImageTarget } from "./editor/image-target";
import { platform, isDesktop } from "./platform";
import type { WorkspaceAsset, WorkspaceFile, WorkspaceRoot } from "./platform/types";
import { resolveRelativePath } from "./workspace/paths";
import { BUILTIN_TEMPLATES, workspaceTemplates } from "./workspace/templates";
import { loadImageRoot, saveImageRoot } from "./workspace/store";
import { countChars, countWords, readingMinutes } from "./utils/text-stats";
import { useWorkspace } from "./workspace/useWorkspace";

interface ViewModesState {
  source: boolean;
  focus: boolean;
  typewriter: boolean;
}

/** 取父目录（同时兼容 `/` 与 `\\`）。 */
function dirnameOf(target: string): string {
  const index = Math.max(target.lastIndexOf("/"), target.lastIndexOf("\\"));
  return index > 0 ? target.slice(0, index) : "";
}

/** 判断路径是否在某个目录内（大小写不敏感，够用于「是否需要换根目录」）。 */
function isInsideDir(root: string, target: string): boolean {
  const r = root.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
  const t = target.replace(/\\/g, "/").toLowerCase();
  return t === r || t.startsWith(`${r}/`);
}

export function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** 从 AI 对话点「设置」时直接落到 AI 页；普通入口保持上次所在页。 */
  const [settingsSection, setSettingsSection] = useState<"ai" | undefined>(undefined);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [confirmRequest, setConfirmRequest] = useState<ConfirmRequest | null>(null);
  const confirmResolve = useRef<((id: string | null) => void) | null>(null);

  const openSettings = useCallback((section?: "ai") => {
    setSettingsSection(section);
    setSettingsOpen(true);
  }, []);

  const requestConfirm = useCallback((request: ConfirmRequest) => {    return new Promise<string | null>((resolve) => {
      confirmResolve.current?.(null);
      confirmResolve.current = resolve;
      setConfirmRequest(request);
    });
  }, []);

  useEffect(() => registerConfirm(requestConfirm), [requestConfirm]);

  const settleConfirm = useCallback((id: string | null) => {
    const resolve = confirmResolve.current;
    confirmResolve.current = null;
    setConfirmRequest(null);
    resolve?.(id);
  }, []);
  const [helpMode, setHelpMode] = useState<"about" | "shortcuts" | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>("outline");
  const [statusBar, setStatusBar] = useState(true);
  const [modes, setModes] = useState<ViewModesState>({ source: false, focus: false, typewriter: false });
  const [recent, setRecent] = useState<RecentFile[]>([]);
  const [selectedText, setSelectedText] = useState("");
  const [imageRoot, setImageRoot] = useState<WorkspaceRoot | null>(null);
  /** 新建 / 转为项目的对话框；root 是待写入清单的目录。 */
  const [projectDraft, setProjectDraft] = useState<{
    root: WorkspaceRoot;
    request: ProjectDialogRequest;
  } | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettingsRequest | null>(null);
  const [projectAi, setProjectAi] = useState<ProjectAiRequest | null>(null);
  /** 清单坏掉的提示每个根目录只弹一次，避免每次重扫都刷屏。 */
  const warnedProject = useRef("");
  const [findOpen, setFindOpen] = useState(false);
  const [findFocus, setFindFocus] = useState<"query" | "replace">("query");
  const [findQuery, setFindQuery] = useState("");
  const [findReplacement, setFindReplacement] = useState("");
  const [findCase, setFindCase] = useState(false);
  const [findWholeWord, setFindWholeWord] = useState(false);
  const [findRegex, setFindRegex] = useState(false);
  const [findInSelection, setFindInSelection] = useState(false);
  const [findScope, setFindScope] = useState<{ from: number; to: number } | null>(null);
  const [findActive, setFindActive] = useState(0);
  const [initialText] = useState(() => SAMPLE_DOC);

  /**
   * 启动页等到这里再退：`MarkdownEditor` 是子组件，它的挂载 effect 先于本组件执行，
   * 所以此时编辑器已经创建、首帧内容已经就绪。启动页自己还有 250ms 最短展示，
   * 不会因为这里调用得太快而闪一下。
   */
  useEffect(() => {
    markSplashReady();
  }, []);

  // 编辑器实例要先于文档状态存在：自动保存需要知道是否正在输入法组合中。
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const pendingJump = useRef<number | null>(null);
  /** 桌面端从命令行 / 文件关联打开了文件：此时不要让会话恢复覆盖它。 */
  const shellOpened = useRef(false);

  const doc = useDocument({
    autosaveDelay: settings.autosaveDelay,
    autoSaveFile: settings.autoSaveFile,
    fallbackText: initialText,
    isComposing: () => Boolean(editorRef.current?.getView()?.composing),
    shouldRestore: () => !shellOpened.current,
    restoreSession: settings.startup === "session",
    defaultLineEnding: settings.defaultLineEnding,
  });
  const workspace = useWorkspace();
  const [fileError, setFileError] = useState<string | null>(null);
  /** 刚刚导出的文件路径：提示条上提供「打开 / 所在文件夹」。 */
  const [exportedPath, setExportedPath] = useState<string | null>(null);
  /** 检测到的 Pandoc 版本；null 表示没找到（Word/ePub 导出会禁用）。 */
  const [pandocVersion, setPandocVersion] = useState<string | null>(null);
  /** 文件在外部被改过、而本地还有未保存修改时，等用户选择「重新加载 / 保留我的」。 */
  const [externalChange, setExternalChange] = useState<string | null>(null);
  const desktop = isDesktop();
  const updater = useUpdater();

  /** 长操作提示：同一时间只显示最上层的消息，计数归零才收起。 */
  const [busy, setBusy] = useState<string | null>(null);
  const busyCount = useRef(0);
  const yieldFrame = useCallback(
    () =>
      new Promise<void>((resolve) => {
        // 先让提示条画出来，再跑可能卡住渲染进程的活。
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0));
      }),
    [],
  );
  const withBusy = useCallback(
    async <T,>(message: string, task: () => Promise<T> | T): Promise<T> => {
      busyCount.current += 1;
      setBusy(message);
      await yieldFrame();
      try {
        return await task();
      } finally {
        busyCount.current -= 1;
        if (busyCount.current === 0) setBusy(null);
      }
    },
    [yieldFrame],
  );

  /** 事件订阅里要拿到最新的 doc，但不想每次渲染都重新订阅。 */
  const docRef = useRef(doc);
  docRef.current = doc;

  /** 编辑器里的最新文本；保存 / 导出 / 打印都用它，避免 React 状态落后一拍。 */
  const liveText = useCallback(
    () => editorRef.current?.getView()?.state.doc.toString() ?? doc.text,
    [doc.text],
  );

  // ---- AI 动作（菜单命令 / 选区浮条 / 反 AI 腔规则层）----
  const getViewSlot = useCallback((): EditorView | null => editorRef.current?.getView() ?? null, []);
  /**
   * 项目规范（`WRITARA.md` / `AGENTS.md`）：离当前文档最近的那一份，进 AI 系统提示词。
   * 用 ref 缓存是因为请求发起处是同步的，而读文件是异步的。
   */
  const projectRef = useRef("");
  const projectInstructions = workspace.project.manifest?.instructions ?? "";
  const projectGuide = workspace.project.guide ?? "";
  useEffect(() => {
    let alive = true;
    // 清单指定优先；没指定或指向的文件不在了，取最近祖先 / 根目录的指令文件。
    const file = pickProjectFile(workspace.files, doc.path, projectInstructions || projectGuide);
    if (!file) {
      projectRef.current = "";
      return () => {
        alive = false;
      };
    }
    void workspace.read(file).then(
      (content) => {
        if (alive) projectRef.current = clipProjectText(content.text);
      },
      () => {
        if (alive) projectRef.current = "";
      },
    );
    return () => {
      alive = false;
    };
  }, [workspace.files, workspace.read, doc.path, projectInstructions, projectGuide]);
  /** 当前标题结构 → 「按大纲写初稿」的提纲文本；没有标题时为空串。 */
  const outlinePrompt = useCallback((): string => {
    const items = collectOutline(liveText());
    if (!items.length) return "";
    const lines = items.map(
      (item) => `${"#".repeat(Math.min(6, Math.max(1, item.level)))} ${item.text}`,
    );
    return [
      "请按下面的标题结构写出完整初稿：标题原样保留，每节 2～4 段；确实需要时补三级标题，不要另换主题。",
      "",
      ...lines,
    ].join("\n");
  }, [liveText]);
  const ai = useAi({
    getView: getViewSlot,
    getDoc: liveText,
    outlinePrompt,
    getProjectDoc: () => projectRef.current,
  });

  // ---- 右侧 AI 对话 ----
  const [chatOpen, setChatOpen] = useState(() => {
    try {
      return localStorage.getItem("writara:chat-open") === "1";
    } catch {
      return false;
    }
  });
  /** 对话宽度：可拖，持久化；clamp 时给编辑区留够 A4 宽度。 */
  const [chatWidth, setChatWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem("writara:chat-width"));
      if (Number.isFinite(value)) return Math.min(520, Math.max(300, value));
    } catch {
      // 隐私模式：用默认宽度
    }
    return 360;
  });
  useEffect(() => {
    try {
      localStorage.setItem("writara:chat-width", String(chatWidth));
    } catch {
      // 同上：记不住宽度不影响使用
    }
  }, [chatWidth]);

  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const A4_WIDTH = 672;
  const MIN_CHAT_WIDTH = 300;
  const MIN_SIDEBAR_WIDTH = 200;

  /** 侧栏宽度（用户拖出来的，跨重启保留）。App 需要它判断三栏是否放得下。 */
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      const value = Number(localStorage.getItem("writara:sidebar-width"));
      if (Number.isFinite(value) && value >= MIN_SIDEBAR_WIDTH) {
        return Math.min(360, value);
      }
    } catch {
      // 隐私模式：按默认宽度
    }
    return 240;
  });

  /**
   * 三栏放不下时**不再自动收起对话**：侧栏与 AI 面板改为浮层（覆盖在编辑区上），
   * 编辑区保持 A4 宽度（不够就由 `.wr-scroll` 横向滚动）。
   *
   * 用窗口宽度而不是量 DOM：浮层本身不占布局宽度，这样「浮层 / 非浮层」两种状态下
   * 判断条件一致，不会被自己的布局结果影响；也避免 ResizeObserver 在窗口被遮挡时
   * 不派发（Electron 里 rAF/渲染步骤会暂停）导致状态卡在旧值。
   */
  const [panelsFloat, setPanelsFloat] = useState(false);
  const measurePanels = useCallback(() => {
    const width = document.documentElement.clientWidth || window.innerWidth;
    const needed =
      A4_WIDTH + (sidebarVisible ? sidebarWidth : 0) + (chatOpen ? chatWidth : 36);
    setPanelsFloat(width + 0.5 < needed);
  }, [sidebarVisible, sidebarWidth, chatOpen, chatWidth]);

  useLayoutEffect(() => {
    measurePanels();
  }, [measurePanels, viewportWidth]);

  /** 侧栏能占的最大宽度：不把编辑区压到 A4 以下，也不挤掉对话。浮层时不受这个限制。 */
  const sidebarMaxWidth = panelsFloat
    ? undefined
    : Math.max(MIN_SIDEBAR_WIDTH, viewportWidth - A4_WIDTH - (chatOpen ? chatWidth : 0) - 1);

  const clampChatWidth = useCallback(
    (next: number) => {
      const max = panelsFloat
        ? 520
        : Math.max(MIN_CHAT_WIDTH, viewportWidth - A4_WIDTH - MIN_SIDEBAR_WIDTH - 1);
      setChatWidth(Math.min(max, Math.max(MIN_CHAT_WIDTH, next)));
    },
    [panelsFloat, viewportWidth],
  );
  useEffect(() => {
    try {
      localStorage.setItem("writara:chat-open", chatOpen ? "1" : "0");
    } catch {
      // 隐私模式写不进去，只影响下次默认展开
    }
  }, [chatOpen]);

  const chatSelection = useCallback((): ChatSelection | null => {
    const view = getViewSlot();
    if (!view) return null;
    const selection = view.state.selection.main;
    if (selection.empty) return null;
    return {
      from: selection.from,
      to: selection.to,
      text: view.state.sliceDoc(selection.from, selection.to),
    };
  }, [getViewSlot]);

  const chat = useChat({
    getView: getViewSlot,
    getSelection: chatSelection,
    getProjectDoc: () => projectRef.current,
    docKey: doc.path ?? doc.name,
    onRemember: (text) => {
      setSettings((current) => ({
        ...current,
        aiMemory: [
          ...current.aiMemory,
          { id: `m-${Date.now().toString(36)}`, text: text.slice(0, 500), createdAt: Date.now() },
        ].slice(-100),
      }));
    },
  });

  const chatModelLabel = useMemo(() => {
    const agentId = settings.aiAgentId || "";
    if (!agentId.startsWith("cli:")) return "未选择 Agent";
    const id = agentId.slice(4);
    const names: Record<string, string> = {
      opencode: "OpenCode",
      claude: "Claude Code",
      codex: "Codex CLI",
      gemini: "Gemini CLI",
      qwen: "Qwen Code",
      "cursor-agent": "Cursor Agent",
    };
    return `${names[id] ?? id} · ${settings.aiAgentModels[id] || "CLI 默认"}`;
  }, [settings.aiAgentId, settings.aiAgentModels]);

  // 对话面板下方的模型切换器：列表来自当前 agent 的 CLI
  const [chatModels, setChatModels] = useState<string[]>([]);
  const [chatModelsLoading, setChatModelsLoading] = useState(false);
  const [chatModelsNonce, setChatModelsNonce] = useState(0);
  useEffect(() => {
    if (!chatOpen) return;
    let alive = true;
    const agentId = settings.aiAgentId || "";
    if (!agentId.startsWith("cli:")) {
      setChatModels([]);
      return;
    }
    setChatModelsLoading(true);
    void (async () => {
      try {
        const list = (await window.writara?.ai?.models(agentId.slice(4))) ?? [];
        if (alive) setChatModels(list);
      } catch {
        if (alive) setChatModels([]);
      } finally {
        if (alive) setChatModelsLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [chatOpen, chatModelsNonce, settings.aiAgentId]);

  const chatModel = settings.aiAgentId.startsWith("cli:")
    ? (settings.aiAgentModels[settings.aiAgentId.slice(4)] ?? "")
    : "";

  // ---- 文档体检 ----
  const [checkProfile, setCheckProfile] = useState<CheckProfile>("general");
  const [checkReport, setCheckReport] = useState<CheckReport | null>(null);

  const runDocumentCheck = useCallback(
    (profile: CheckProfile = checkProfile) => {
      const view = editorRef.current?.getView();
      if (!view) return;
      const files = workspace.files.map((file) => file.path);
      const text = view.state.doc.toString();
      void withBusy("正在体检文档…", async () => {
        await yieldFrame();
        const issues = runChecks(text, {
          profile,
          docPath: doc.path,
          files: doc.path ? files : undefined,
        });
        setCheckProfile(profile);
        setCheckReport({ docName: doc.name || "未命名", profile, issues });
        if (!issues.length) toast.success("体检通过：没有发现问题");
      });
    },
    [checkProfile, doc.name, doc.path, withBusy, workspace.files, yieldFrame],
  );

  const jumpToIssue = useCallback((issue: CheckIssue) => {
    const view = editorRef.current?.getView();
    if (!view || issue.from === null) return;
    const pos = Math.min(issue.from, view.state.doc.length);
    view.dispatch({ selection: { anchor: pos }, scrollIntoView: true });
    view.focus();
  }, []);

  /** 应用所有可自动修复的项（目前只有中文半角标点）。 */
  const fixAutoIssues = useCallback(
    (profile: CheckProfile): number => {
      const view = editorRef.current?.getView();
      if (!view) return 0;
      const files = workspace.files.map((file) => file.path);
      const issues = runChecks(view.state.doc.toString(), {
        profile,
        docPath: doc.path,
        files: doc.path ? files : undefined,
      });
      const fixes = issues.flatMap((issue) => (issue.fix ? [issue.fix] : []));
      if (!fixes.length) {
        toast.info("没有可自动修复的问题");
        return 0;
      }
      const unique = [
        ...new Map(fixes.map((fix) => [`${fix.from}:${fix.to}`, fix])).values(),
      ].sort((a, b) => a.from - b.from);
      view.dispatch({ changes: unique });
      view.focus();
      toast.success(`已修复 ${unique.length} 处`);
      return unique.length;
    },
    [doc.path, workspace.files],
  );

  const copyCheckReport = useCallback(() => {
    if (!checkReport) return;
    void navigator.clipboard?.writeText(formatReport(checkReport.issues, checkReport.docName));
    toast.success("体检报告已复制");
  }, [checkReport]);

  // ---- 写作任务单 ----
  const [brief, setBrief] = useState<WritingBrief>(() => loadBrief());
  const [briefOpen, setBriefOpen] = useState(false);

  const updateBrief = useCallback((next: WritingBrief) => {
    setBrief(next);
    saveBrief(next);
  }, []);

  const startBriefDraft = useCallback(async () => {
    const view = editorRef.current?.getView();
    if (!view) return;
    if (view.state.doc.toString().trim()) {
      const answer = await askConfirm({
        title: "任务单初稿会替换当前内容",
        message: "生成后仍可在审阅浮层里放弃。继续吗？",
        actions: [{ id: "replace", label: "继续生成", primary: true }],
        cancelLabel: "取消",
      });
      if (answer !== "replace") return;
    }
    setBriefOpen(false);
    ai.startPipeline({ brief, project: projectRef.current, replace: true });
  }, [ai, brief]);

  // ---- 待审提案（外部 agent 的写入通道）----
  const [proposals, setProposals] = useState<ProposalView[] | null>(null);

  const reloadProposals = useCallback(async () => {
    await withBusy("正在读取提案…", async () => {
      const files = proposalFiles(workspace.configFiles);
      const views: ProposalView[] = [];
      for (const file of files) {
        try {
          const content = await workspace.read(file);
          const parsed = parseProposal(file.path, content.text);
          if (!parsed) continue;
          const targetFile = workspace.files.find((entry) => entry.path === parsed.target);
          let targetText: string | null = null;
          if (targetFile) {
            try {
              targetText = (await workspace.read(targetFile)).text;
            } catch {
              targetText = null;
            }
          }
          views.push({ ...parsed, targetText, isCurrent: doc.path === parsed.target });
        } catch {
          // 单个提案读不出来就跳过，不影响其他提案
        }
      }
      setProposals(views);
    });
  }, [doc.path, withBusy, workspace]);

  const acceptProposal = useCallback(
    async (view: ProposalView) => {
      if (view.isCurrent) {
        const editorView = editorRef.current?.getView();
        if (!editorView) return;
        editorView.dispatch({
          changes: { from: 0, to: editorView.state.doc.length, insert: view.content },
          selection: { anchor: 0 },
        });
        editorView.focus();
        toast.undo(`提案已应用：${view.title}`, {
          label: "撤销",
          run: () => cmd.undoCommand(editorView),
        });
        await reloadProposals();
        return;
      }
      const targetFile = workspace.files.find((entry) => entry.path === view.target);
      if (!targetFile) {
        toast.error("目标文件不在工作区里，无法写入");
        return;
      }
      try {
        await platform().write(targetFile.ref, view.content);
        toast.success(`已写入 ${view.target}`);
        await workspace.refresh();
        await reloadProposals();
      } catch (cause) {
        toast.error(describeFileError(cause));
      }
    },
    [reloadProposals, workspace],
  );

  /**
   * 切换文件前保证当前内容不会丢：
   * 「切换文件前保存」开着就直接保存，关掉就询问；保存失败/用户取消都返回 false。
   */
  const ensureSaved = useCallback(async (): Promise<boolean> => {
    const current = docRef.current;
    if (!current.dirty) return true;
    if (settings.saveBeforeSwitch) return await current.save(liveText());
    const answer = await askConfirm({
      title: "有未保存的修改",
      message: "切换文件前要先保存吗？",
      actions: [
        { id: "discard", label: "放弃修改", tone: "danger" },
        { id: "save", label: "保存并继续", primary: true },
      ],
    });
    if (answer === "save") return await current.save(liveText());
    return answer === "discard";
  }, [liveText, settings.saveBeforeSwitch]);

  const deferredText = useDeferredValue(doc.text);
  const outline = useMemo(() => collectOutline(deferredText), [deferredText]);

  /**
   * 侧栏高亮用的当前文件路径。
   *
   * 命令行 / 最近文件打开时只有文件身份（`DocRef`）没有工作区相对路径，
   * 这时按身份（桌面端是绝对路径）或唯一文件名反查一次。
   */
  const activeTreePath = useMemo(() => {
    if (doc.path) return doc.path;
    if (!doc.ref) return null;
    const native = doc.ref.native;
    const sameRef = workspace.files.find((file) => file.ref.native === native);
    if (sameRef) return sameRef.path;
    const byName = workspace.files.filter((file) => file.name === doc.name);
    return byName.length === 1 ? byName[0]!.path : null;
  }, [doc.path, doc.ref, doc.name, workspace.files]);

  const stats = useMemo(() => {
    const words = countWords(doc.text);
    return { words, chars: countChars(doc.text), minutes: readingMinutes(words, settings.readingWpm) };
  }, [doc.text, settings.readingWpm]);

  const findMatchesList = useMemo(
    () =>
      findOpen
        ? findMatches(doc.text, findQuery, {
            caseSensitive: findCase,
            regex: findRegex,
            wholeWord: findWholeWord,
            scope: findInSelection ? findScope : null,
          })
        : [],
    [findOpen, doc.text, findQuery, findCase, findWholeWord, findRegex, findInSelection, findScope],
  );
  const findInvalidRegex = useMemo(() => {
    if (!findRegex || !findQuery) return false;
    try {
      new RegExp(findQuery);
      return false;
    } catch {
      return true;
    }
  }, [findQuery, findRegex]);
  const findMatchesRef = useRef<FindMatch[]>(findMatchesList);
  findMatchesRef.current = findMatchesList;

  const apply = useCallback((fn: (view: EditorView) => unknown): boolean => {
    const view = editorRef.current?.getView();
    if (!view) return false;
    return Boolean(fn(view));
  }, []);

  // ---- 应用内输入框 ----

  /**
   * 代替 `window.prompt`：Electron 没有实现 prompt，调用会抛
   * `prompt() is not supported.`，打包版里新建/重命名/插表格会全部失效。
   * 这里用 `<dialog>` 自己做，返回值仍是 Promise<string | null>（取消为 null）。
   */
  const [promptState, setPromptState] = useState<PromptRequest | null>(null);
  const promptResolve = useRef<((value: string | null) => void) | null>(null);

  const askText = useCallback((request: PromptRequest): Promise<string | null> => {
    return new Promise((resolve) => {
      promptResolve.current?.(null);
      promptResolve.current = resolve;
      setPromptState(request);
    });
  }, []);

  const settlePrompt = useCallback((value: string | null) => {
    const resolve = promptResolve.current;
    promptResolve.current = null;
    setPromptState(null);
    resolve?.(value);
  }, []);

  // ---- 工作区 ----

  const openWorkspaceFile = useCallback(
    async (file: WorkspaceFile) => {
      if (!(await ensureSaved())) return;
      try {
        setFileError(null);
        await withBusy(`正在打开「${file.name}」…`, async () => {
          const content = await workspace.read(file);
          doc.openExternal(content.text, file.name, file.ref, file.path, {
            encoding: content.encoding,
            bom: content.bom,
          });
          // 编辑器在 effect 里才替换文档并重新解析；多等一帧再收起提示。
          await yieldFrame();
        });
        setSidebarVisible(true);
      } catch {
        setFileError(`无法读取 ${file.path}`);
      }
    },
    [doc, ensureSaved, workspace, withBusy, yieldFrame],
  );

  /**
   * 打开项目资源（图片 / 附件）。
   *
   * 资源不是文档，不进编辑器：桌面端交给系统默认程序；浏览器没有绝对路径，
   * 只能提示用户到系统文件夹里打开（不假装成功）。
   */
  const openWorkspaceAsset = useCallback(
    async (asset: WorkspaceAsset) => {
      const absolute = typeof asset.ref.native === "string" ? asset.ref.native : null;
      if (!absolute) {
        toast.info("浏览器里无法直接打开附件，请在系统文件夹中打开");
        return;
      }
      try {
        await window.writara?.shell.openPath(absolute);
      } catch (cause) {
        toast.error(describeFileError(cause));
      }
    },
    [],
  );

  const createWorkspaceFile = useCallback(async () => {
    const name = await askText({
      title: "新建文件",
      label: "文件名",
      value: "新文档.md",
      hint: "不写扩展名会自动补 .md。",
      confirmText: "创建",
    });
    if (!name) return;
    const file = await workspace.createFile(name);
    if (file) await openWorkspaceFile(file);
  }, [askText, openWorkspaceFile, workspace]);

  /** 从模板新建：内置模板用自带正文，工作区模板先读文件；名字可改。 */
  const createFromTemplate = useCallback(
    async (templateId: string) => {
      const builtin = BUILTIN_TEMPLATES.find((tpl) => tpl.id === templateId);
      let name = `${builtin?.name ?? templateId}.md`;
      let content = builtin?.content ?? "";
      if (!builtin) {
        const path = templateId.startsWith("tpl-") ? templateId.slice(4) : "";
        const file =
          workspace.configFiles.find((entry) => entry.path === path) ??
          workspace.files.find((entry) => entry.path === path);
        if (!file) {
          toast.error("找不到这份模板，可能已被删除或不在工作区里");
          return;
        }
        try {
          const readContent = await workspace.read(file);
          content = readContent.text;
          name = file.name;
        } catch {
          toast.error(`无法读取模板 ${file.path}`);
          return;
        }
      }
      const nextName = await askText({
        title: "从模板新建",
        label: "文件名",
        value: name,
        hint: "不写扩展名会自动补 .md。",
        confirmText: "创建",
      });
      if (!nextName) return;
      // 先问名字再处理当前文档：用户改了主意就不会触发「先保存」这一步
      if (!(await ensureSaved())) return;
      const finalName = nextName.endsWith(".md") || nextName.includes(".") ? nextName : `${nextName}.md`;
      doc.openExternal(content, finalName, null);
    },
    [askText, doc, ensureSaved, workspace],
  );

  const renameWorkspaceFile = useCallback(
    async (file: WorkspaceFile, nextName?: string) => {
      const name =
        nextName ??
        (await askText({
          title: "重命名",
          label: file.path,
          value: file.name,
          confirmText: "重命名",
        }));
      if (!name || name === file.name) return;
      const next = await workspace.renameFile(file, name);
      if (!next) return;
      // 重命名的是当前打开的文件：同步文档身份，否则下一次保存会写回旧路径。
      const samePath = doc.path !== null && doc.path === file.path;
      const sameRef = doc.ref !== null && doc.ref.native === file.ref.native;
      if (samePath || sameRef) {
        doc.renameIdentity({ name: next.name, ref: next.ref, path: next.path });
      }
    },
    [askText, doc, workspace],
  );

  const deleteWorkspaceFile = useCallback(
    async (file: WorkspaceFile) => {
      const answer = await askConfirm({
        title: "删除文件",
        message: `${file.path} 会从磁盘删除；8 秒内可以撤销。`,
        actions: [{ id: "delete", label: "删除", tone: "danger" }],
      });
      if (answer !== "delete") return;

      // 先读出原文：撤销要按原路径重建，删除后就取不回来了。
      let text: string;
      try {
        text = (await workspace.read(file)).text;
      } catch {
        toast.error("无法读取文件，未删除");
        return;
      }

      const active =
        (doc.path !== null && doc.path === file.path) ||
        (doc.ref !== null && doc.ref.native === file.ref.native);

      const removed = await workspace.deleteFile(file);
      if (!removed) {
        toast.error(`无法删除 ${file.path}`);
        return;
      }
      if (active) doc.openExternal("", "未命名.md", null);

      toast.undo(`已删除 ${file.path}`, {
        label: "撤销",
        run: () => {
          void (async () => {
            const restored = await workspace.restoreFile(file.path, text);
            if (!restored) {
              toast.error("撤销失败：原位置可能已经有同名文件");
              return;
            }
            if (active) await openWorkspaceFile(restored);
            else toast.success("已恢复");
          })();
        },
      });
    },
    [doc, openWorkspaceFile, workspace],
  );

  // ---- 右键菜单 ----
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: ContextEntry[];
  } | null>(null);
  const closeContextMenu = useCallback(() => setContextMenu(null), []);

  const openMenuAt = useCallback((x: number, y: number, items: ContextEntry[]) => {
    setContextMenu({ x, y, items });
  }, []);

  /** 窄屏：侧栏改为抽屉、顶栏动作收进「⋯」。760px 与 CSS 的断点保持一致。 */
  const [narrow, setNarrow] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
  );

  useEffect(() => {
    const query = window.matchMedia("(max-width: 760px)");
    const update = () => setNarrow(query.matches);
    update();
    query.addEventListener("change", update);
    // 某些环境（CDP 设备模拟、部分 WebView）只改视口不派发 change，补一个 resize 兜底
    window.addEventListener("resize", update);
    return () => {
      query.removeEventListener("change", update);
      window.removeEventListener("resize", update);
    };
  }, []);

  // 第一次进入窄屏（或启动时就是窄屏）收起侧栏：抽屉默认不该盖住正文
  const narrowRef = useRef(false);
  useEffect(() => {
    if (narrow && !narrowRef.current) setSidebarVisible(false);
    narrowRef.current = narrow;
  }, [narrow]);

  /** 桌面端才有绝对路径（浏览器只有句柄），资源管理器与「复制路径」都靠它。 */
  const absolutePathOf = useCallback((native: unknown): string | null => {
    return typeof native === "string" && native ? native : null;
  }, []);

  const workspaceRootPath = workspace.root ? absolutePathOf(workspace.root.native) : null;

  const joinWorkspacePath = useCallback(
    (relative: string): string | null => {
      if (!workspaceRootPath) return null;
      const separator = workspaceRootPath.includes("\\") ? "\\" : "/";
      const parts = relative.split("/").filter(Boolean);
      return [workspaceRootPath.replace(/[\\/]+$/, ""), ...parts].join(separator);
    },
    [workspaceRootPath],
  );

  // ---- 项目：新建 / 转为项目 ----

  const chooseProjectFolder = useCallback(async () => {
    try {
      const root = await platform().chooseFolder({ mode: "readwrite", id: "writara" });
      if (!root) return;
      // 已经是项目（有清单或指令文件）：不重写任何东西，直接打开。
      const manifest = await platform().readRootFile(root, PROJECT_MANIFEST_PATH);
      const guide =
        (await platform().readRootFile(root, "WRITARA.md")) ??
        (await platform().readRootFile(root, "AGENTS.md"));
      if (manifest || guide) {
        await workspace.openRoot(root);
        toast.info("这个文件夹已经是项目");
        return;
      }
      setProjectDraft({
        root,
        request: { mode: "create", title: root.name, path: absolutePathOf(root.native) },
      });
    } catch (cause) {
      toast.error(describeFileError(cause));
    }
  }, [absolutePathOf, workspace]);

  const convertToProject = useCallback(() => {
    const root = workspace.root;
    if (!root) return;
    setProjectDraft({
      root,
      request: {
        mode: "convert",
        title: workspace.projectName || root.name,
        path: absolutePathOf(root.native),
      },
    });
  }, [absolutePathOf, workspace.projectName, workspace.root]);

  const submitProject = useCallback(
    async (draft: ProjectDraft) => {
      const current = projectDraft;
      if (!current) return;
      setProjectDraft(null);
      try {
        const manifest = createManifest(draft.title, draft.kind);
        const saved = await createProjectFiles(current.root, manifest, { guide: draft.guide });
        if (current.request.mode === "convert") {
          // 新写入的指令文件还没进扫描结果：整目录重扫一次。
          await workspace.refresh();
          toast.success(`已转为项目「${saved.title}」`);
          return;
        }
        if (await workspace.openRoot(current.root)) {
          toast.success(`已创建项目「${saved.title}」`);
        }
      } catch (cause) {
        toast.error(describeFileError(cause));
      }
    },
    [projectDraft, workspace],
  );

  const openProjectSettings = useCallback(() => {
    if (!workspace.root) return;
    setProjectSettings({
      manifest: workspace.project.manifest,
      title: workspace.projectName || workspace.root.name,
      guide: workspace.project.guide,
    });
  }, [workspace.project.guide, workspace.project.manifest, workspace.projectName, workspace.root]);

  const submitProjectSettings = useCallback(
    async (manifest: ProjectManifest) => {
      setProjectSettings(null);
      if (!workspace.root) return;
      try {
        await writeProject(workspace.root, manifest);
        await workspace.reloadProject();
        toast.success("项目设置已保存");
      } catch (cause) {
        toast.error(describeFileError(cause));
      }
    },
    [workspace],
  );

  /** 读齐项目正文并逐章渲染（图片解析器绑定到每章所在目录）。 */
  const renderCurrentProject = useCallback(async () => {
    const root = workspace.root;
    if (!root) return null;
    const manifest = workspace.project.manifest;
    const documents = orderedDocuments(workspace.files, manifest);
    if (!documents.length) {
      toast.info("项目里还没有可导出的正文");
      return null;
    }

    const chapters: ProjectChapterInput[] = [];
    for (const file of documents) {
      let text: string;
      try {
        text = (await workspace.read(file)).text;
      } catch {
        throw new Error(`无法读取 ${file.path}，导出已中止`);
      }
      const outline = collectOutline(text);
      const heading = outline.find((item) => item.level === 1) ?? outline[0];
      chapters.push({
        path: file.path,
        title: heading?.text || file.name.replace(/\.(md|markdown|mdx|txt)$/i, ""),
        text,
      });
    }

    const title = manifest?.title || workspace.projectName || root.name;
    const style = settings.exportStyle;
    const rendered = await renderProject(
      chapters,
      {
        title,
        toc: manifest?.export.toc ?? false,
        chapterBreak: manifest?.export.chapterBreak ?? true,
        style,
      },
      (chapterPath) => async (src) => {
        const target = resolveRelativePath(chapterPath, src);
        if (!target) return null;
        return await platform().readImage(root, target);
      },
    );
    return { rendered, title, style };
  }, [settings.exportStyle, workspace]);

  /** 合并导出：桌面端直接出 PDF；浏览器没有 PDF 通道时下载合并后的 HTML。 */
  const exportProjectSingle = useCallback(async () => {
    await withBusy("正在合并章节并导出…", async () => {
      try {
        setFileError(null);
        const prepared = await renderCurrentProject();
        if (!prepared) return;
        const { rendered, title, style } = prepared;

        const path = await exportHtmlAsPdf(rendered.html, `${title}.pdf`, {
          title,
          style,
          pageNumbers: settings.pdfPageNumbers,
          author: settings.pdfAuthor,
        });
        if (path) {
          setExportedPath(path);
          if (settings.openExportFolder) void window.writara?.shell.showItemInFolder(path);
          toast.success(`已导出「${title}」`);
          return;
        }

        downloadHtmlText(rendered.html, `${title}.html`);
        toast.info("浏览器里没有 PDF 通道，已下载合并后的 HTML");
      } catch (cause) {
        toast.error(describeFileError(cause));
      }
    });
  }, [
    renderCurrentProject,
    settings.openExportFolder,
    settings.pdfAuthor,
    settings.pdfPageNumbers,
    withBusy,
  ]);

  /** 目录式导出：每章一个 HTML，外加目录索引页。 */
  const exportProjectBundle = useCallback(async () => {
    await withBusy("正在合并章节…", async () => {
      try {
        setFileError(null);
        const prepared = await renderCurrentProject();
        if (!prepared) return;
        const folder = await platform().chooseFolder({ mode: "readwrite", id: "writara-export" });
        if (!folder) return;

        const files = prepared.rendered.chapters.map((chapter, index) => ({
          title: chapter.title,
          fileName: chapterFileName(index, chapter.title),
        }));
        for (const [index, chapter] of prepared.rendered.chapters.entries()) {
          setBusy(`正在导出第 ${index + 1}/${files.length} 章…`);
          await platform().writeRootFile(
            folder,
            files[index]!.fileName,
            chapterDocumentHtml(chapter, prepared.style, prepared.rendered.fonts),
          );
        }
        await platform().writeRootFile(
          folder,
          "index.html",
          bundleIndexHtml(prepared.title, files, prepared.style, prepared.rendered.fonts),
        );

        toast.success(`已导出 ${files.length} 章到所选文件夹`);
        const dir = absolutePathOf(folder.native);
        if (dir) {
          const separator = dir.includes("\\") ? "\\" : "/";
          void window.writara?.shell.showItemInFolder(
            `${dir.replace(/[\\/]+$/, "")}${separator}index.html`,
          );
        }
      } catch (cause) {
        toast.error(describeFileError(cause));
      }
    });
  }, [absolutePathOf, renderCurrentProject, withBusy]);

  // ---- 项目 AI：多文件任务 → 逐文件 diff → 勾选写回 ----

  const openProjectAi = useCallback(() => {
    if (!workspace.isProject) {
      toast.info("先把这个文件夹转为项目，再运行项目 AI 任务");
      return;
    }
    const documents = orderedDocuments(workspace.files, workspace.project.manifest);
    if (!documents.length) {
      toast.info("项目里还没有正文");
      return;
    }
    setProjectAi({
      title: workspace.projectName || workspace.root?.name || "项目",
      files: documents.map((file) => ({
        path: file.path,
        title: file.name.replace(/\.(md|markdown|mdx|txt)$/i, ""),
      })),
    });
  }, [workspace]);

  /** 项目级任务用清单指定的规范（缺省用根目录指令文件），不走「最近祖先」。 */
  const projectGuideText = useCallback(async (): Promise<string> => {
    const path = workspace.project.manifest?.instructions || workspace.project.guide || "";
    const file = path ? workspace.files.find((entry) => entry.path === path) : undefined;
    if (!file) return projectRef.current;
    try {
      return clipProjectText((await workspace.read(file)).text);
    } catch {
      return projectRef.current;
    }
  }, [workspace]);

  const runProjectAi = useCallback(
    async (task: string, paths: string[]) => {      if (!workspace.root) throw new Error("没有打开项目");
      if (!(await ensureSaved())) throw new Error("当前文档还有未保存的修改");

      const documents = orderedDocuments(workspace.files, workspace.project.manifest);
      const picked = documents.filter((file) => paths.includes(file.path));
      if (!picked.length) throw new Error("没有可用的文件");

      const files: Array<{ path: string; text: string }> = [];
      let total = 0;
      for (const file of picked) {
        const content = await workspace.read(file);
        // agent 与 diff 都按 LF 工作；写回时再恢复原文件的换行风格。
        const text = normalizeLineEndings(content.text);
        if (text.length > 120_000) {
          throw new Error(`${file.path} 太长（超过 12 万字符），请单独处理`);
        }
        total += text.length;
        files.push({ path: file.path, text });
      }
      if (total > 240_000) {
        throw new Error("选中的文件合计超过 24 万字符，请减少文件后重试");
      }

      const result = await runProjectTask({
        settings,
        task,
        files,
        project: await projectGuideText(),
      });
      if (!result.ok) throw new Error(result.error || "Agent 运行失败");

      return {
        message:
          result.message ||
          (result.changed.length ? `改动了 ${result.changed.length} 个文件` : "没有改动"),
        changes: result.changed.map((file) => ({
          path: file.path,
          before: files.find((input) => input.path === file.path)?.text ?? "",
          after: file.text,
        })),
      };
    },
    [ensureSaved, projectGuideText, settings, workspace],
  );

  const undoProjectAi = useCallback(
    async (changes: ProjectAiChange[]) => {
      let restored = 0;
      let blocked = 0;
      for (const change of changes) {
        try {
          if (doc.path && change.path === doc.path) {
            const view = editorRef.current?.getView();
            if (!view || view.state.doc.toString() !== change.after) {
              blocked += 1;
              continue;
            }
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: change.before },
            });
            restored += 1;
            continue;
          }
          const file = workspace.files.find((entry) => entry.path === change.path);
          if (!file) {
            blocked += 1;
            continue;
          }
          const content = await workspace.read(file);
          if (normalizeLineEndings(content.text) !== change.after) {
            blocked += 1;
            continue;
          }
          await platform().write(file.ref, applyLineEnding(change.before, detectLineEnding(content.text)), {
            encoding: content.encoding,
            bom: content.bom,
          });
          restored += 1;
        } catch {
          blocked += 1;
        }
      }
      if (restored) toast.success(`已撤销 ${restored} 个文件`);
      if (blocked) toast.info(`${blocked} 个文件已被修改，未撤销，请用 Ctrl+Z 或手动恢复`);
    },
    [doc.path, workspace],
  );

  const applyProjectAi = useCallback(
    async (changes: ProjectAiChange[]) => {
      const applied: ProjectAiChange[] = [];
      try {
        for (const change of changes) {
          if (doc.path && change.path === doc.path) {
            const view = editorRef.current?.getView();
            if (view) {
              // 当前文档走一次 dispatch（可撤销），不直接写盘。
              view.dispatch({
                changes: { from: 0, to: view.state.doc.length, insert: change.after },
              });
              applied.push(change);
              continue;
            }
          }
          const file = workspace.files.find((entry) => entry.path === change.path);
          if (!file) continue;
          const content = await workspace.read(file);
          if (normalizeLineEndings(content.text) !== change.before) {
            toast.error(`${change.path} 已在别处修改，未写入`);
            continue;
          }
          await platform().write(file.ref, applyLineEnding(change.after, detectLineEnding(content.text)), {
            encoding: content.encoding,
            bom: content.bom,
          });
          applied.push(change);
        }

        if (!applied.length) {
          toast.info("没有写入任何文件");
          return;
        }
        void workspace.refresh();
        toast.undo(`已写入 ${applied.length} 个文件`, {
          label: "撤销",
          run: () => void undoProjectAi(applied),
        });
      } catch (cause) {
        toast.error(describeFileError(cause));
      }
    },
    [doc.path, undoProjectAi, workspace],
  );

  // 坏清单 / 版本过高：降级为普通文件夹，只提示一次。
  useEffect(() => {
    const invalid = workspace.project.invalid;
    if (!invalid || !workspace.root) {
      warnedProject.current = "";
      return;
    }
    const key = `${workspace.projectName}|${invalid}`;
    if (warnedProject.current === key) return;
    warnedProject.current = key;
    toast.error(`项目清单无法读取：${invalid}。已按普通文件夹打开。`);
  }, [workspace.project.invalid, workspace.projectName, workspace.root]);

  const copyText = useCallback((text: string) => {
    void navigator.clipboard.writeText(text);
  }, []);

  const fileMenuItems = useCallback(
    (file: WorkspaceFile): ContextEntry[] => {
      const absolute = absolutePathOf(file.ref.native);
      const items: ContextEntry[] = [
        { kind: "item", label: "打开", run: () => void openWorkspaceFile(file) },
      ];

      if (absolute) {
        items.push({ kind: "separator" });
        items.push({
          kind: "item",
          label: "打开所在文件夹",
          run: () => void window.writara?.shell.showItemInFolder(absolute),
        });
        items.push({ kind: "item", label: "复制路径", run: () => copyText(absolute) });
      }

      items.push({ kind: "item", label: "复制相对路径", run: () => copyText(file.path) });
      items.push({ kind: "separator" });
      items.push({ kind: "item", label: "重命名…", run: () => void renameWorkspaceFile(file) });
      items.push({
        kind: "item",
        label: "删除",
        danger: true,
        run: () => void deleteWorkspaceFile(file),
      });
      return items;
    },
    [absolutePathOf, copyText, deleteWorkspaceFile, openWorkspaceFile, renameWorkspaceFile],
  );

  const assetMenuItems = useCallback(
    (asset: WorkspaceAsset): ContextEntry[] => {
      const absolute = absolutePathOf(asset.ref.native);
      const items: ContextEntry[] = [];
      if (absolute) {
        items.push({ kind: "item", label: "打开", run: () => void openWorkspaceAsset(asset) });
        items.push({
          kind: "item",
          label: "打开所在文件夹",
          run: () => void window.writara?.shell.showItemInFolder(absolute),
        });
        items.push({ kind: "item", label: "复制路径", run: () => copyText(absolute) });
      }
      items.push({ kind: "item", label: "复制相对路径", run: () => copyText(asset.path) });
      return items;
    },
    [absolutePathOf, copyText, openWorkspaceAsset],
  );

  const folderMenuItems = useCallback(
    (relative: string): ContextEntry[] => {
      const absolute = joinWorkspacePath(relative);
      const items: ContextEntry[] = [];
      if (absolute) {
        items.push({
          kind: "item",
          label: "打开文件夹",
          run: () => void window.writara?.shell.showItemInFolder(absolute),
        });
        items.push({ kind: "item", label: "复制文件夹路径", run: () => copyText(absolute) });
      }
      items.push({ kind: "item", label: "复制相对路径", run: () => copyText(relative.replace(/\/$/, "")) });
      items.push({ kind: "separator" });
      items.push({ kind: "item", label: "刷新", run: () => void workspace.refresh() });
      return items;
    },
    [copyText, joinWorkspacePath, workspace],
  );


  const blankTreeMenuItems = useCallback((): ContextEntry[] => {
    const items: ContextEntry[] = [
      { kind: "item", label: "新建文件", run: () => void createWorkspaceFile() },
    ];
    if (workspace.isProject) {
      items.push(
        { kind: "separator" },
        { kind: "item", label: "项目设置…", run: openProjectSettings },
        { kind: "item", label: "项目 AI 任务…", run: openProjectAi },
        { kind: "item", label: "导出项目（合并 PDF）…", run: () => void exportProjectSingle() },
        { kind: "item", label: "导出项目（分章 HTML）…", run: () => void exportProjectBundle() },
      );
    } else {
      // 没有指令文件也没有清单：给一个「转为项目」的入口。
      items.push({ kind: "item", label: "转为项目…", run: convertToProject });
    }
    items.push(
      { kind: "separator" },
      { kind: "item", label: "刷新", run: () => void workspace.refresh() },
      { kind: "separator" },
      { kind: "item", label: "关闭文件夹", danger: true, run: () => void workspace.closeFolder() },
    );
    return items;
  }, [
    convertToProject,
    createWorkspaceFile,
    exportProjectBundle,
    exportProjectSingle,
    openProjectAi,
    openProjectSettings,
    workspace,
  ]);

  const openSearchResult = useCallback(
    async (file: WorkspaceFile, offset: number) => {
      if (!(await ensureSaved())) return;
      try {
        setFileError(null);
        await withBusy(`正在打开「${file.name}」…`, async () => {
          const content = await workspace.read(file);
          pendingJump.current = offset;
          doc.openExternal(content.text, file.name, file.ref, file.path, {
            encoding: content.encoding,
            bom: content.bom,
          });
          await yieldFrame();
        });
      } catch {
        setFileError(`无法读取 ${file.path}`);
      }
    },
    [doc, ensureSaved, workspace, withBusy, yieldFrame],
  );

  const handleDrop = useCallback(
    async (event: React.DragEvent<HTMLDivElement>) => {
      const files = Array.from(event.dataTransfer.files ?? []);
      const markdown = files.find((file) => /\.(md|markdown|txt)$/i.test(file.name));
      if (!markdown) return;
      event.preventDefault();
      if (!(await ensureSaved())) return;
      try {
        await withBusy(`正在打开「${markdown.name}」…`, async () => {
          doc.openExternal(await markdown.text(), markdown.name, null);
          await yieldFrame();
        });
      } catch {
        setFileError(`无法读取 ${markdown.name}`);
      }
    },
    [doc, ensureSaved, withBusy, yieldFrame],
  );

  /** 从磁盘重新载入当前文件（外部修改后用户选择「重新加载」）。 */
  const reloadFromDisk = useCallback(async (target: string) => {
    try {
      await withBusy("正在重新载入…", async () => {
        const file = await platform().openPath?.(target);
        if (!file) {
          setFileError("文件已被移动或删除");
          return;
        }
        docRef.current.openExternal(file.text, file.name, file.ref, docRef.current.path, file.format);
        await yieldFrame();
      });
    } catch (cause) {
      setFileError(describeFileError(cause));
    }
  }, [withBusy, yieldFrame]);

  const openRecent = useCallback(
    async (entry: RecentFile) => {
      if (!(await ensureSaved())) return;
      const native = typeof entry.ref.native === "string" ? entry.ref.native : null;
      if (native && typeof doc.ref?.native === "string" && doc.ref.native === native) {
        toast.info("这已经是当前文档");
        return;
      }
      try {
        setFileError(null);
        await platform().restoreAccess?.(entry.ref);
        if (!(await platform().requestAccess(entry.ref))) {
          setFileError(`没有读取 ${entry.name} 的权限`);
          return;
        }
        await withBusy(`正在打开「${entry.name}」…`, async () => {
          const text = await platform().read(entry.ref);
          if (text === null) {
            setFileError(`无法打开 ${entry.name}，文件可能已被移动或删除`);
            toast.error(`${entry.name} 已不在原位置，已从最近列表移除`);
            void forgetRecent(entry.ref);
            return;
          }
          doc.openExternal(text.text, entry.name, entry.ref, null, {
            encoding: text.encoding,
            bom: text.bom,
          });
          await yieldFrame();
        });
      } catch {
        setFileError(`无法打开 ${entry.name}，文件可能已被移动或删除`);
        toast.error(`${entry.name} 打不开，已从最近列表移除`);
        void forgetRecent(entry.ref);
      }
    },
    [doc, ensureSaved, withBusy, yieldFrame],
  );

  /**
   * 从菜单打开最近文件。
   *
   * 菜单里的 id 是**路径**而不是下标：多窗口时两个窗口的最近列表可能不同，
   * 菜单由 A 窗口的状态构建、点击却发生在 B 窗口，按下标就会错位或什么都不打开。
   * 路径在列表里找不到时直接按路径打开（桌面端）。
   */
  const openRecentByPath = useCallback(
    async (target: string) => {
      const entry = recent.find(
        (item) => typeof item.ref.native === "string" && item.ref.native === target,
      );
      if (entry) {
        await openRecent(entry);
        return;
      }
      if (!(await ensureSaved())) return;
      try {
        setFileError(null);
        const name = target.split(/[\\/]/).pop() || target;
        await withBusy(`正在打开「${name}」…`, async () => {
          await platform().restoreAccess?.({ name: "", native: target });
          const file = await platform().openPath?.(target);
          if (!file) {
            setFileError(`无法打开 ${target}，文件可能已被移动或删除`);
            toast.error("文件可能已被移动或删除");
            return;
          }
          doc.openExternal(file.text, file.name, file.ref, null, file.format);
          await yieldFrame();
        });
      } catch (cause) {
        setFileError(describeFileError(cause));
      }
    },
    [doc, ensureSaved, openRecent, recent, withBusy, yieldFrame],
  );

  /** 同上，最近文件夹：菜单 id 里带路径，避免多窗口下标错位。 */
  const openRecentFolderPath = useCallback(
    async (target: string) => {
      const index = workspace.folders.findIndex(
        (entry) => typeof entry.root.native === "string" && entry.root.native === target,
      );
      if (index >= 0) {
        await workspace.openRecentFolder(index);
        return;
      }
      try {
        await platform().restoreRootAccess?.({ name: "", native: target });
        await workspace.openAt(target);
      } catch (cause) {
        setFileError(describeFileError(cause));
      }
    },
    [workspace],
  );

  useEffect(() => {
    let alive = true;
    const load = () => {
      void listRecent().then((list) => {
        if (alive) setRecent(list);
      });
    };
    load();
    window.addEventListener("writara:recent", load);
    return () => {
      alive = false;
      window.removeEventListener("writara:recent", load);
    };
  }, []);

  // ---- 设置与视图状态 ----

  useEffect(() => {
    applySettings(settings);
    saveSettings(settings);
    configurePrint({
      paper: settings.paper,
      margin: settings.margin,
      fontSize: settings.fontSize,
      measure: settings.measure,
    });
    setCustomCss(settings.customCss);
    // 主题变化会影响 Mermaid 的渲染配色，让它重建一次。
    editorRef.current?.refreshPreview();
  }, [settings]);

  useEffect(() => {
    editorRef.current?.setSourceMode(modes.source);
  }, [modes.source]);

  useEffect(() => {
    editorRef.current?.setViewModes({ focus: modes.focus, typewriter: modes.typewriter });
  }, [modes.focus, modes.typewriter]);

  useEffect(() => {
    editorRef.current?.setEditorOptions({
      spellcheck: settings.spellcheck,
      smartPunctuation: settings.smartPunctuation,
      codeLineNumbers: settings.codeLineNumbers,
      codeIndent: settings.codeIndent,
    });
  }, [settings.spellcheck, settings.smartPunctuation, settings.codeLineNumbers, settings.codeIndent]);

  // 拼写检查语言由 Electron 的 session 管理；空数组表示跟随系统。
  useEffect(() => {
    if (!desktop || settings.spellLanguages.length === 0) return;
    void window.writara?.spell.set(settings.spellLanguages);
  }, [desktop, settings.spellLanguages]);

  // 单独打开文档时用的图片根目录（上次选择过就恢复）。
  useEffect(() => {
    let alive = true;
    void loadImageRoot().then((root) => {
      if (alive && root) setImageRoot(root);
    });
    return () => {
      alive = false;
    };
  }, []);

  // 工作区文档的相对路径图片：先装解析器，再同步文档（顺序不能反）。
  // 单独打开的文件：优先用文档所在目录（桌面端），其次才是「图片根目录」。
  useEffect(() => {
    if (doc.path && workspace.root) {
      const root = workspace.root;
      const docPath = doc.path;

      setImageResolver(async (src) => {
        const target = resolveRelativePath(docPath, src);
        if (!target) return null;
        return await platform().readImage(root, target);
      });
      return;
    }

    const native = doc.ref && typeof doc.ref.native === "string" ? doc.ref.native : null;
    if (!workspace.root && native) {
      // 文档自己的目录就是相对路径的根（打开/保存时主进程已授权该目录）。
      const dir = native.slice(0, Math.max(native.lastIndexOf("/"), native.lastIndexOf("\\")));
      if (dir) {
        const root = { name: "document", native: dir };
        setImageResolver(async (src) => {
          const target = resolveRelativePath(doc.name || "document.md", src);
          if (!target) return null;
          return await platform().readImage(root, target);
        });
        return;
      }
    }

    if (!imageRoot) {
      setImageResolver(null);
      return;
    }

    const root = imageRoot;
    setImageResolver(async (src) => {
      const target = resolveRelativePath("document.md", src);
      if (!target) return null;
      return await platform().readImage(root, target);
    });
  }, [doc.path, doc.name, doc.ref, workspace.root, imageRoot]);

  // 拖入图片的落盘位置：当前文档的磁盘路径（没有就退回 data URL）。
  useEffect(() => {
    const native = doc.ref && typeof doc.ref.native === "string" ? doc.ref.native : null;
    setImageTarget(native ? () => native : null);
    return () => setImageTarget(null);
  }, [doc.ref]);

  /**
   * 打开文件后自动把它所在的目录作为工作区，文件树立即可用。
   * 文件本来就在当前工作区里时保持不动，不打断用户选好的根目录。
   */
  const lastTreeDir = useRef<string | null>(null);  useEffect(() => {
    if (!desktop) return;

    const native = doc.ref && typeof doc.ref.native === "string" ? doc.ref.native : null;
    if (!native) return;

    const rootNative =
      workspace.root && typeof workspace.root.native === "string" ? workspace.root.native : null;
    if (rootNative && isInsideDir(rootNative, native)) return;

    const dir = dirnameOf(native);
    if (!dir || lastTreeDir.current === dir) return;
    lastTreeDir.current = dir;
    void workspace.openAt(dir);
  }, [desktop, doc.ref, workspace]);

  // Pandoc 探测：装了才启用 Word / ePub 导出；设置为空时把探测结果写回设置。
  useEffect(() => {
    if (!desktop) return;
    let alive = true;
    void window.writara?.pandoc
      ?.detect(settings.pandocPath)
      .then((found) => {
        if (!alive) return;
        setPandocVersion(found?.version ?? null);
        if (found && !settings.pandocPath) {
          setSettings((current) => ({ ...current, pandocPath: found.path }));
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [desktop, settings.pandocPath]);

  // 查找：匹配数变化时收敛当前下标。
  useEffect(() => {
    setFindActive((index) => (findMatchesList.length === 0 ? 0 : Math.min(index, findMatchesList.length - 1)));
  }, [findMatchesList.length]);

  // 查找高亮：只在打开时更新，关闭时清一次。
  // 这个 effect 会随每次输入重跑；无谓的 dispatch（尤其在输入法组合期间）
  // 会打断候选上屏，表现出来就是光标乱跳、打字丢字。
  const findHighlightsShown = useRef(false);
  useEffect(() => {
    const view = editorRef.current?.getView();
    if (!view) return;

    if (!findOpen) {
      if (!findHighlightsShown.current || view.composing) return;
      findHighlightsShown.current = false;
      view.dispatch({ effects: clearFindMatches.of(null) });
      return;
    }

    if (view.composing) return;
    findHighlightsShown.current = true;
    view.dispatch({
      effects: setFindMatches.of({ matches: findMatchesList, current: findActive }),
    });
  }, [findOpen, findMatchesList, findActive, doc.loadToken]);

  // 改查找词/选项时跳到第一个匹配；替换后不跳，免得打断连续替换。
  useEffect(() => {
    if (!findOpen) return;
    const list = findMatchesRef.current;
    setFindActive(0);
    const first = list[0];
    if (first) editorRef.current?.selectRange(first.from, first.to);
  }, [findQuery, findCase, findWholeWord, findRegex, findInSelection, findOpen]);

  // 从外部换掉文档时同步给编辑器；搜索跳转在这里补一次定位。
  useEffect(() => {
    if (doc.loadToken > 0) {
      editorRef.current?.setDoc(doc.text);
      const jump = pendingJump.current;
      pendingJump.current = null;
      if (jump !== null) editorRef.current?.goTo(jump);
    }
  }, [doc.loadToken]);

  useEffect(() => {
    document.title = `${doc.dirty ? "● " : ""}${doc.name} — Writara｜文叙`;
  }, [doc.dirty, doc.name]);

  useEffect(() => {
    if (desktop || !doc.dirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [desktop, doc.dirty]);

  useEffect(() => {
    const repaint = () => {
      const text = liveText();
      if (!isPrintPrepared(text)) updatePrintView(text);
    };
    window.addEventListener("beforeprint", repaint);
    return () => window.removeEventListener("beforeprint", repaint);
  }, [liveText]);

  // 浏览器菜单里的「打印」不会等异步渲染，所以停笔一会儿就把打印区准备好，
  // 这样 Mermaid 与代码高亮在原生打印路径下也不会缺。
  //
  // 桌面端不需要：菜单打印会先 await 渲染，不会绕过它。而且这里每次重建
  // 都会重排整个打印区（几百个元素），正好落在「打完字移开鼠标」的时刻，
  // 表现为整页闪一下、滚动条被重算。浏览器端改成空闲时再做。
  useEffect(() => {
    if (desktop) return;

    let cancelled = false;
    const render = () => {
      if (cancelled) return;
      // 输入法组合期间不跑打印渲染：高亮/Mermaid 的同步计算会拖住主线程，
      // 打断候选上屏。组合提交会有新的 doc.text 变化，稍后会再排一次。
      if (editorRef.current?.getView()?.composing) return;
      void preparePrintView(liveText());
    };

    const timer = window.setTimeout(() => {
      if (typeof requestIdleCallback === "function") {
        requestIdleCallback(render, { timeout: 4000 });
      } else {
        render();
      }
    }, 1500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [desktop, liveText]);

  // ---- 命令 ----

  const menuState = useMemo<MenuState>(
    () => ({
      sidebarVisible,
      sidebarMode,
      sourceMode: modes.source,
      focusMode: modes.focus,
      typewriterMode: modes.typewriter,
      statusBar,
      style: settings.style,
      lineEnding: doc.lineEnding,
      utf8: doc.format.encoding === "utf8" && !doc.format.bom,
      spellcheck: settings.spellcheck,
      smartPunctuation: settings.smartPunctuation,
      hasCustomCss: settings.customCss.trim().length > 0,
      recent: recent.map((entry) => entry.name),
      recentIds: recent.map((entry, index) =>
        typeof entry.ref.native === "string"
          ? `recent-file:${encodeURIComponent(String(entry.ref.native))}`
          : `recent-${index}`,
      ),
      recentFolders: workspace.folders.map((entry) => entry.name),
      recentFolderIds: workspace.folders.map((entry, index) =>
        typeof entry.root.native === "string"
          ? `recent-folder:${encodeURIComponent(entry.root.native)}`
          : `recent-folder-${index}`,
      ),
      pandocAvailable: Boolean(pandocVersion),
      isProject: workspace.isProject,
      chatOpen,
      updates: desktop,
      templates: [
        ...BUILTIN_TEMPLATES.map((tpl) => ({ id: tpl.id, label: tpl.name })),
        ...workspaceTemplates(workspace.configFiles).map((tpl) => ({ id: tpl.id, label: tpl.name })),
      ],
    }),
    [
      sidebarVisible,
      sidebarMode,
      modes,
      statusBar,
      settings.style,
      settings.spellcheck,
      settings.smartPunctuation,
      settings.customCss,
      doc.lineEnding,
      doc.format.encoding,
      doc.format.bom,
      recent,
      workspace.folders,
      workspace.files,
      workspace.isProject,
      pandocVersion,
      chatOpen,
      desktop,
    ],
  );

  const menus = useMemo(() => createMenus(menuState), [menuState]);

  const insertAtCursor = useCallback(
    (text: string) => {
      apply((view) => {
        const range = view.state.selection.main;
        view.dispatch({
          changes: { from: range.from, to: range.to, insert: text },
          selection: { anchor: range.from + text.length },
        });
        return true;
      });
    },
    [apply],
  );

  const pickImage = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      if (files.length === 0) return;
      apply((view) => {
        void insertImages(view, files, view.state.selection.main.head);
        return true;
      });
    });
    input.click();
  }, [apply]);

  const insertTableDialog = useCallback(async () => {
    const answer = await askText({
      title: "插入表格",
      label: "尺寸（行 x 列）",
      value: "3x3",
      hint: `行数最多 ${TABLE_LIMITS.rows}，列数最多 ${TABLE_LIMITS.columns}。`,
      confirmText: "插入",
    });
    if (!answer) return;
    const { rows, columns } = parseTableSize(answer);
    apply((view) => cmd.insertTable(view, rows, columns));
  }, [apply, askText]);

  const zoom = useCallback((delta: number | "reset") => {
    setSettings((current) => ({
      ...current,
      fontSize: delta === "reset" ? 17 : Math.min(24, Math.max(13, current.fontSize + delta)),
    }));
  }, []);

  // ---- 查找和替换 ----

  const openFind = useCallback((target: "query" | "replace") => {
    const view = editorRef.current?.getView();
    const range = view?.state.selection.main;
    const hasSelection = Boolean(range && range.to > range.from);
    setFindScope(hasSelection && range ? { from: range.from, to: range.to } : null);
    setFindInSelection(false);
    setFindFocus(target);
    setFindOpen(true);
  }, []);

  const closeFind = useCallback(() => {
    const match = findMatchesRef.current[findActive];
    setFindOpen(false);
    if (match) editorRef.current?.selectRange(match.from, match.to);
    editorRef.current?.focus();
  }, [findActive]);

  const jumpFind = useCallback((index: number) => {
    const list = findMatchesRef.current;
    if (list.length === 0) return;
    const next = ((index % list.length) + list.length) % list.length;
    setFindActive(next);
    const match = list[next];
    if (match) editorRef.current?.selectRange(match.from, match.to);
  }, []);

  const findNext = useCallback(() => jumpFind(findActive + 1), [findActive, jumpFind]);
  const findPrevious = useCallback(() => jumpFind(findActive - 1), [findActive, jumpFind]);

  const replaceCurrent = useCallback(() => {
    const view = editorRef.current?.getView();
    const match = findMatchesRef.current[findActive];
    if (!view || !match) return;
    const insert = replacementFor(
      doc.text,
      match,
      findQuery,
      { caseSensitive: findCase, regex: findRegex },
      findReplacement,
    );
    view.dispatch({ changes: { from: match.from, to: match.to, insert } });
  }, [doc.text, findActive, findQuery, findCase, findRegex, findReplacement]);

  const replaceAll = useCallback(() => {
    const view = editorRef.current?.getView();
    const list = findMatchesRef.current;
    if (!view || list.length === 0) return;
    view.dispatch({
      changes: list.map((match) => ({
        from: match.from,
        to: match.to,
        insert: replacementFor(
          doc.text,
          match,
          findQuery,
          { caseSensitive: findCase, regex: findRegex },
          findReplacement,
        ),
      })),
    });
  }, [doc.text, findQuery, findCase, findRegex, findReplacement]);

  /** 选择「单独打开文档」的图片根目录；菜单与偏好设置共用。 */
  const chooseImageRoot = useCallback(async () => {
    try {
      const root = await platform().chooseFolder({ mode: "read", id: "writara-images" });
      if (!root) return;
      setImageRoot(root);
      await saveImageRoot(root);
      // 已经渲染的图片需要重新解析。
      editorRef.current?.refreshPreview();
      void preparePrintView(liveText());
      setFileError(null);
    } catch (cause) {
      setFileError(describeFileError(cause));
    }
  }, [liveText]);

  /** 导入自定义 CSS；菜单命令与偏好设置共用。 */
  const importCustomCss = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".css,text/css";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) return;
      void file.text().then((css) => setSettings((current) => ({ ...current, customCss: css })));
    });
    input.click();
  }, []);

  const handlePreferenceAction = useCallback(
    (action: PreferenceAction) => {
      if (action === "import-css") importCustomCss();
      else if (action === "clear-css") setSettings((current) => ({ ...current, customCss: "" }));
      else if (action === "set-image-root") void chooseImageRoot();
      else if (action === "restore-draft") {
        const draft = loadDraft();
        if (!draft) {
          setFileError("没有可恢复的草稿");
          return;
        }
        void (async () => {
          if (!(await ensureSaved())) return;
          docRef.current.openExternal(draft.text, draft.name, null);
        })();
      }
    },
    [chooseImageRoot, ensureSaved, importCustomCss],
  );

  const handleEditorContextMenu = useCallback(
    (event: React.MouseEvent) => {
      const view = editorRef.current?.getView();
      if (!view) return;
      event.preventDefault();

      const coords = { x: event.clientX, y: event.clientY };
      const table = tableContextAt(view, coords);
      const selection = view.state.selection.main;
      const hasSelection = !selection.empty;

      const items: ContextEntry[] = [
        {
          kind: "item",
          label: "剪切",
          hint: "Ctrl+X",
          disabled: !hasSelection,
          run: () => void cutSelection(view),
        },
        {
          kind: "item",
          label: "复制",
          hint: "Ctrl+C",
          run: () => copyText(view.state.sliceDoc(selection.from, selection.to)),
        },
        { kind: "item", label: "粘贴", hint: "Ctrl+V", run: () => void pasteText(view) },
        { kind: "separator" },
        {
          kind: "submenu",
          label: "复制为",
          items: [
            { kind: "item", label: "Markdown", run: () => void copyAs(view, "markdown") },
            { kind: "item", label: "HTML", run: () => void copyAs(view, "html") },
            { kind: "item", label: "纯文本", run: () => void copyAs(view, "plain") },
          ],
        },
        { kind: "separator" },
        {
          kind: "submenu",
          label: "AI",
          items: [
            { kind: "item", label: "润色", disabled: !hasSelection, run: () => dispatchAiAction(view, "polish") },
            { kind: "item", label: "扩写", disabled: !hasSelection, run: () => dispatchAiAction(view, "expand") },
            { kind: "item", label: "缩写", disabled: !hasSelection, run: () => dispatchAiAction(view, "shorten") },
            { kind: "item", label: "去 AI 腔", disabled: !hasSelection, run: () => dispatchAiAction(view, "deslop") },
            { kind: "item", label: "生成表格", disabled: !hasSelection, run: () => dispatchAiAction(view, "table") },
            { kind: "item", label: "生成图表", disabled: !hasSelection, run: () => dispatchAiAction(view, "chart") },
            { kind: "item", label: "生成公式", disabled: !hasSelection, run: () => dispatchAiAction(view, "formula") },
            { kind: "item", label: "续写", run: () => ai.runCommand("ai-continue") },
            { kind: "separator" },
            { kind: "item", label: "检查 AI 腔（标记）", run: () => ai.runCommand("ai-antislop-rules") },
            { kind: "item", label: "清理 AI 腔", run: () => ai.runCommand("ai-antislop-apply") },
            { kind: "item", label: "清除 AI 腔标记", run: () => ai.runCommand("ai-antislop-clear") },
            { kind: "separator" },
            { kind: "item", label: "文档体检", run: () => runDocumentCheck() },
          ],
        },
        { kind: "separator" },
        {
          kind: "item",
          label: "全选",
          hint: "Ctrl+A",
          run: () => {
            view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
            view.focus();
          },
        },
        { kind: "item", label: "查找…", hint: "Ctrl+F", run: () => openFind("query") },
      ];

      if (table) {
        items.push({ kind: "separator" });
        items.push({
          kind: "submenu",
          label: "表格",
          items: [
            ...tableCommandList(table.target).flatMap((entry, index) => {
              const node: ContextEntry = {
                kind: "item",
                label: entry.label,
                disabled: entry.disabled,
                danger: entry.danger,
                run: () => runTableCommand(view, table.target, entry.command),
              };
              return entry.separatorBefore && index > 0
                ? [{ kind: "separator" } as ContextEntry, node]
                : [node];
            }),
            { kind: "separator" } as ContextEntry,
            {
              kind: "item",
              label: "编辑表格源码",
              run: () => {
                view.dispatch({ selection: { anchor: table.target.from + 1 } });
                view.focus();
              },
            },
          ],
        });
      }

      openMenuAt(event.clientX, event.clientY, items);
    },
    [ai.runCommand, copyAs, copyText, openFind, openMenuAt, runDocumentCheck],
  );

  const runCommand = useCallback(
    (id: string) => {
      // AI 命令：同一前缀，内部再分派（菜单 / 面板 / 右键共用）
      if (id.startsWith("ai-")) {
        ai.runCommand(id);
        return;
      }
      // 模板命令
      if (id.startsWith("from-template-")) {
        void createFromTemplate(id.slice("from-template-".length));
        return;
      }

      // 纯编辑器命令
      const editorCommand = EDITOR_COMMANDS[id];
      if (editorCommand) {
        apply(editorCommand);
        return;
      }

      switch (id) {
        case "chat-toggle":
          setChatOpen((value) => !value);
          return;
        case "proposals-open":
          void reloadProposals();
          return;
        case "brief-draft":
          setBriefOpen(true);
          return;
        case "check-document":
          runDocumentCheck();
          return;
        case "check-update":
          // 打开关于页再检查：检查要十几秒，必须让用户看见转圈和结果。
          setHelpMode("about");
          void updater.check();
          return;
        case "check-fix-all": {
          if (fixAutoIssues(checkProfile) > 0) runDocumentCheck(checkProfile);
          return;
        }
        case "new":
          void (async () => {
            if (!(await ensureSaved())) return;
            doc.openExternal("", "未命名.md", null);
          })();
          return;
        case "from-template-none":
          return;
        case "new-window":
          if (desktop) void window.writara?.newWindow();
          else window.open(window.location.href, "_blank", "popup=yes,width=1280,height=860,noopener");
          return;
        case "open":
          void (async () => {
            if (!(await ensureSaved())) return;
            await withBusy("正在打开文件…", () => doc.open());
          })();
          return;
        case "open-folder":
          void workspace.openFolder();
          return;
        case "new-project":
          void chooseProjectFolder();
          return;
        case "set-image-root":
          void chooseImageRoot();
          return;
        case "save":
          void doc.save(liveText());
          return;
        case "save-as":
          void doc.saveAs(liveText());
          return;
        case "reveal": {
          const target = doc.ref && typeof doc.ref.native === "string" ? doc.ref.native : null;
          if (target) void window.writara?.shell.showItemInFolder(target);
          return;
        }
        case "copy-path": {
          const target = doc.ref && typeof doc.ref.native === "string" ? doc.ref.native : null;
          if (target) void navigator.clipboard.writeText(target);
          return;
        }
        case "convert-utf8":
          void withBusy("正在转换编码…", () => doc.convertToUtf8());
          return;
        case "export-html":
          void withBusy("正在生成 HTML…", () =>
            downloadHtml(liveText(), doc.name, undefined, settings.exportStyle),
          );
          return;
        case "export-pdf":
          void (async () => {
            try {
              setFileError(null);
              const path = await withBusy("正在生成 PDF…", () =>
                exportPdf(liveText(), doc.name, {
                  pageNumbers: settings.pdfPageNumbers,
                  pageRanges: settings.pdfPageRanges || undefined,
                  style: settings.exportStyle,
                  author: settings.pdfAuthor,
                }),
              );
              if (path) {
                setExportedPath(path);
                if (settings.openExportFolder) {
                  void window.writara?.shell.showItemInFolder(path);
                }
              }
            } catch (cause) {
              setFileError(describeFileError(cause));
            }
          })();
          return;
        case "export-png":
          void withBusy("正在生成 PNG…", () => exportPng(liveText(), doc.name));
          return;
        case "export-project-single":
          void exportProjectSingle();
          return;
        case "export-project-bundle":
          void exportProjectBundle();
          return;
        case "project-ai":
          openProjectAi();
          return;
        case "export-docx":
        case "export-epub": {
          const format: "docx" | "epub" = id === "export-docx" ? "docx" : "epub";
          const native = doc.ref && typeof doc.ref.native === "string" ? doc.ref.native : "";
          void (async () => {
            try {
              setFileError(null);
              const path = await withBusy(
                format === "docx" ? "正在导出 Word…" : "正在导出 ePub…",
                () =>
                  exportWithPandoc(liveText(), doc.name, format, {
                    pandocPath: settings.pandocPath,
                    resourceDir: native ? dirnameOf(native) : undefined,
                    template: settings.docxTemplate,
                    customTemplate: settings.docxTemplatePath,
                    toc: settings.docxToc,
                    numberSections: settings.docxNumberSections,
                    pageNumbers: settings.docxPageNumbers,
                  }),
              );
              if (path) {
                setExportedPath(path);
                if (settings.openExportFolder) {
                  void window.writara?.shell.showItemInFolder(path);
                }
              }
            } catch (cause) {
              setFileError(describeFileError(cause));
            }
          })();
          return;
        }
        case "print":
          if (desktop) {
            void (async () => {
              try {
                setFileError(null);
                await withBusy("正在生成打印预览…", () =>
                  previewPdf(liveText(), doc.name, {
                    pageNumbers: settings.pdfPageNumbers,
                    pageRanges: settings.pdfPageRanges || undefined,
                    style: settings.exportStyle,
                    author: settings.pdfAuthor,
                  }),
                );
              } catch (cause) {
                setFileError(describeFileError(cause));
              }
            })();
          } else {
            void withBusy("正在准备打印…", () => printMarkdown(liveText()));
          }
          return;
        case "settings":
          openSettings();
          return;

        case "cut":
          apply((view) => void cutSelection(view));
          return;
        case "copy":
          apply((view) => void copyAs(view, "rich"));
          return;
        case "paste":
          apply((view) => void pasteText(view));
          return;
        case "copy-plain":
          apply((view) => void copyAs(view, "plain"));
          return;
        case "copy-markdown":
          apply((view) => void copyAs(view, "markdown"));
          return;
        case "copy-html":
          apply((view) => void copyAs(view, "html"));
          return;
        case "copy-simple":
          apply((view) => void copyAs(view, "rich"));
          return;
        case "paste-plain":
          apply((view) => void pasteText(view));
          return;
        case "select-all":
          apply((view) => {
            view.dispatch({ selection: { anchor: 0, head: view.state.doc.length } });
            view.focus();
            return true;
          });
          return;
        case "find":
          openFind("query");
          return;
        case "replace":
          openFind("replace");
          return;
        case "spellcheck":
          setSettings((current) => ({ ...current, spellcheck: !current.spellcheck }));
          return;
        case "smart-on":
          setSettings((current) => ({ ...current, smartPunctuation: true }));
          return;
        case "smart-off":
          setSettings((current) => ({ ...current, smartPunctuation: false }));
          return;
        case "line-ending-lf":
          doc.setLineEnding("lf");
          return;
        case "line-ending-crlf":
          doc.setLineEnding("crlf");
          return;
        case "recent-clear":
          void clearRecent();
          return;
        case "recent-none":
          return;

        case "table-insert":
          insertTableDialog();
          return;
        case "image":
          pickImage();
          return;
        case "attachment": {
          const input = document.createElement("input");
          input.type = "file";
          input.multiple = true;
          input.addEventListener("change", () => {
            const files = Array.from(input.files ?? []);
            if (files.length === 0) return;
            apply((view) => {
              void insertAttachments(view, files, view.state.selection.main.head);
              return true;
            });
          });
          input.click();
          return;
        }
        case "front-matter":
          apply((view) => cmd.insertFrontMatter(view, doc.name.replace(/\.(md|markdown|mdx|txt)$/i, "")));
          return;

        case "toggle-sidebar":
          setSidebarVisible((value) => !value);
          return;
        case "palette":
          setPaletteOpen(true);
          return;
        case "sidebar-outline":
          setSidebarMode("outline");
          setSidebarVisible(true);
          return;
        case "sidebar-tree":
          setSidebarMode("tree");
          setSidebarVisible(true);
          return;
        case "search":
          setSearchOpen(true);
          return;
        case "source-mode":
          setModes((current) => ({ ...current, source: !current.source }));
          return;
        case "focus-mode":
          setModes((current) => ({ ...current, focus: !current.focus }));
          return;
        case "typewriter-mode":
          setModes((current) => ({ ...current, typewriter: !current.typewriter }));
          return;
        case "status-bar":
          setStatusBar((value) => !value);
          return;
        case "fullscreen":
          if (document.fullscreenElement) void document.exitFullscreen();
          else void document.documentElement.requestFullscreen().catch(() => undefined);
          return;
        case "zoom-reset":
          zoom("reset");
          return;
        case "zoom-in":
          zoom(1);
          return;
        case "zoom-out":
          zoom(-1);
          return;

        case "help-shortcuts":
          setHelpMode("shortcuts");
          return;
        case "help-about":
          setHelpMode("about");
          return;
        case "help-markdown":
          window.open("https://support.typora.io/Markdown-Reference/", "_blank", "noopener,noreferrer");
          return;
        default:
          break;
      }

      // 注意顺序：`recent-folder:*` / `recent-file:*` 也以 `recent-` 开头，必须先处理。
      if (id.startsWith("recent-file:")) {
        void openRecentByPath(decodeURIComponent(id.slice("recent-file:".length)));
        return;
      }
      if (id.startsWith("recent-folder:")) {
        void openRecentFolderPath(decodeURIComponent(id.slice("recent-folder:".length)));
        return;
      }

      if (id.startsWith("recent-folder-")) {
        if (id === "recent-folder-clear") {
          void workspace.clearFolders();
          return;
        }
        if (id === "recent-folder-none") return;
        const index = Number(id.slice("recent-folder-".length));
        if (Number.isFinite(index)) void workspace.openRecentFolder(index);
        return;
      }

      if (id.startsWith("recent-")) {
        const entry = recent[Number(id.slice("recent-".length))];
        if (entry) void openRecent(entry);
        return;
      }


      if (id.startsWith("emoji-")) {
        const emoji = EMOJI.find((entry) => entry.id === id);
        if (emoji) insertAtCursor(emoji.char);
        return;
      }

      if (id.startsWith("style-")) {
        const style = id.slice("style-".length) as StyleName;
        setSettings((current) => ({ ...current, style }));
        return;
      }

      if (id === "custom-css-import") {
        importCustomCss();
        return;
      }

      if (id === "custom-css-clear") {
        setSettings((current) => ({ ...current, customCss: "" }));
      }
    },
    [
      ai.runCommand,
      apply,
      checkProfile,
      chooseImageRoot,
      chooseProjectFolder,
      createFromTemplate,
      desktop,
      doc,
      exportProjectBundle,
      exportProjectSingle,
      fixAutoIssues,
      importCustomCss,
      insertAtCursor,
      insertTableDialog,
      liveText,
      openFind,
      openProjectAi,
      openRecent,
      openRecentByPath,
      openRecentFolderPath,
      pickImage,
      recent,
      reloadProposals,
      runDocumentCheck,
      settings,
      updater.check,
      withBusy,
      workspace,
      zoom,
    ],
  );

  const runRef = useRef(runCommand);
  runRef.current = runCommand;

  /**
   * 顶栏「导出」菜单：与文件菜单同一批命令 id，进度/提示仍由 runCommand 负责。
   * Pandoc 不可用时把原因写在行尾，并留一个「去设置」的出口。
   */
  const exportMenuItems = useCallback((): ContextEntry[] => {
    const run = (id: string) => () => runRef.current(id);
    const items: ContextEntry[] = [
      {
        kind: "item",
        label: "PDF…",
        hint: desktop ? "Ctrl+Shift+P" : "打印对话框",
        run: run("export-pdf"),
      },
      { kind: "item", label: "HTML…", run: run("export-html") },
      { kind: "item", label: "图片 (PNG)…", run: run("export-png") },
    ];

    if (workspace.isProject) {
      items.push(
        { kind: "separator" },
        { kind: "item", label: "项目（合并 PDF）…", run: run("export-project-single") },
        { kind: "item", label: "项目（分章 HTML）…", run: run("export-project-bundle") },
      );
    }

    if (pandocVersion) {
      items.push({ kind: "item", label: "Word (.docx)…", run: run("export-docx") });
      items.push({ kind: "item", label: "ePub…", run: run("export-epub") });
    } else {
      items.push(
        {
          kind: "item",
          label: "Word (.docx)…",
          hint: "需要 Pandoc",
          disabled: true,
          run: () => undefined,
        },
        {
          kind: "item",
          label: "ePub…",
          hint: "需要 Pandoc",
          disabled: true,
          run: () => undefined,
        },
        { kind: "separator" },
        {
          kind: "item",
          label: "去设置 Pandoc 路径…",
          run: () => openSettings(),
        },
      );
    }
    return items;
  }, [desktop, pandocVersion, workspace.isProject]);

  /** 窄屏顶栏：把所有动作收进一个「⋯」。 */
  const moreMenuItems = useCallback(
    (): ContextEntry[] => [
      { kind: "item", label: "命令面板", hint: "Ctrl+P", run: () => setPaletteOpen(true) },
      { kind: "item", label: "查找替换", hint: "Ctrl+F", run: () => openFind("query") },
      { kind: "separator" },
      { kind: "submenu", label: "导出", items: exportMenuItems() },
      { kind: "separator" },
      { kind: "item", label: "保存", hint: "Ctrl+S", run: () => void doc.save(liveText()) },
      {
        kind: "item",
        label: "偏好设置",
        hint: "Ctrl+,",
        run: () => openSettings(),
      },
    ],
    [doc, exportMenuItems, liveText, openFind],
  );

  // ---- 桌面端桥接 ----

  // 原生菜单的命令 id 与 Web 菜单共用一套，直接交给 runCommand。
  useEffect(() => {
    if (!desktop) return;
    return window.writara?.onMenuCommand((id) => runRef.current(id));
  }, [desktop]);

  // 原生菜单的勾选状态跟着应用状态走。
  useEffect(() => {
    if (!desktop) return;
    void window.writara?.menu.updateState(menuState);
  }, [desktop, menuState]);

  // 双击 .md / 命令行参数打开。订阅完再告诉主进程「可以发了」，
  // 否则主进程在 React 挂载前发来的消息会丢。
  useEffect(() => {
    if (!desktop) return;
    const unsubscribe = window.writara?.onOpenFile((target) => {
      shellOpened.current = true;
      void (async () => {
        try {
          const name = target.split(/[\\/]/).pop() || target;
          await withBusy(`正在打开「${name}」…`, async () => {
            const file = await platform().openPath?.(target);
            if (!file) {
              setFileError(`无法打开 ${target}`);
              return;
            }
            docRef.current.openExternal(file.text, file.name, file.ref, null, file.format);
            await yieldFrame();
          });
        } catch (cause) {
          setFileError(describeFileError(cause));
        }
      })();
    });
    window.writara?.shellReady();
    return unsubscribe;
  }, [desktop, withBusy, yieldFrame]);

  // 主进程只在文档脏时发这个事件；确认后它才真的关窗口。
  useEffect(() => {
    if (!desktop) return;
    return window.writara?.onCloseRequest(() => {
      void (async () => {
        const answer = await askConfirm({
          title: "有未保存的修改",
          message: "关闭窗口前要先保存吗？",
          actions: [
            { id: "discard", label: "不保存", tone: "danger" },
            { id: "save", label: "保存并关闭", primary: true },
          ],
        });
        if (answer === "save") {
          window.writara?.replyClose(await docRef.current.save());
          return;
        }
        window.writara?.replyClose(answer === "discard");
      })();
    });
  }, [desktop]);

  // 外部修改（git checkout、别的编辑器保存）：干净就直接重载，有改动先问。
  useEffect(() => {
    if (!desktop) return;
    const samePath = (a: string, b: string) =>
      window.writara?.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

    return window.writara?.onFileChanged((target) => {
      const current = docRef.current;
      const own = current.ref && typeof current.ref.native === "string" ? current.ref.native : null;
      if (!own || !samePath(own, target)) return;

      if (current.dirty) {
        setExternalChange(target);
        return;
      }
      void reloadFromDisk(target);
    });
  }, [desktop, reloadFromDisk]);

  // 换了文档就把外部修改的提示收起来。
  useEffect(() => {
    setExternalChange(null);
  }, [doc.loadToken]);

  // 脏标记同步给主进程，否则关窗拦截无法判断要不要问。
  useEffect(() => {
    if (!desktop) return;
    window.writara?.setDirty(doc.dirty);
  }, [desktop, doc.dirty]);

  // 全局快捷键（捕获阶段，先于 CodeMirror 的默认键位）。
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.isComposing) return;
      const target = event.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (document.querySelector("dialog[open]")) return;

      const combo = comboFromEvent(event);
      if (EDITOR_NATIVE.has(combo)) return;

      const id = SHORTCUTS[combo];
      if (!id) return;

      event.preventDefault();
      event.stopPropagation();
      runRef.current(id);
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  const paletteCommands = useMemo(() => {
    const list: PaletteCommand[] = [];
    const seen = new Set<string>();

    const walk = (items: ReturnType<typeof createMenus>[number]["items"], trail: string[]) => {
      for (const item of items) {
        if (item.type === "separator") continue;
        if (item.type === "submenu") {
          walk(item.items, [...trail, item.label]);
          continue;
        }
        if (item.disabled) continue;
        // 同一个命令可能出现在两个菜单里（例如「公式块」），命令面板只留一条。
        if (seen.has(item.id)) continue;
        seen.add(item.id);
        list.push({
          id: item.id,
          label: item.label,
          group: "command",
          path: trail.join(" › "),
          keywords: `${trail.join(" ")} ${item.label}`,
          hidden: trail.includes("表情与符号"),
          hint: item.shortcut ? displayShortcut(item.shortcut) : undefined,
          run: () => runRef.current(item.id),
        });
      }
    };

    for (const menu of menus) walk(menu.items, [menu.label]);

    for (const [index, item] of outline.entries()) {
      list.push({
        id: `goto-${index}`,
        label: item.text,
        group: "heading",
        keywords: `标题 ${item.text}`,
        run: () => editorRef.current?.goTo(item.from),
      });
    }

    for (const file of workspace.files) {
      const cut = file.path.lastIndexOf("/");
      list.push({
        id: `file-${file.path}`,
        label: file.name,
        group: "file",
        path: cut > 0 ? file.path.slice(0, cut) : undefined,
        keywords: file.path,
        run: () => void openWorkspaceFile(file),
      });
    }

    return list;
  }, [menus, openWorkspaceFile, outline, workspace.files]);

  const savedLabel = doc.saving ? "保存中…" : doc.dirty ? "未保存" : "已保存";
  const banner = doc.error ?? fileError ?? workspace.error ?? doc.notice;
  // 手动操作优先；没有时用工作区扫描状态（打开/刷新文件夹都会走这里）。
  const busyMessage =
    busy ?? (workspace.busy ? `正在扫描${workspace.name ? `「${workspace.name}」` : "文件夹"}…` : null);
  const bannerIsError = Boolean(doc.error ?? fileError ?? workspace.error);

  // 导出完成用提示层：不挤动正文，也不常驻。
  useEffect(() => {
    if (!exportedPath) return;
    toast.success(
      `已导出：${exportedPath}`,
      desktop ? { label: "打开", run: () => void window.writara?.shell.openPath(exportedPath) } : undefined,
    );
    setExportedPath(null);
  }, [desktop, exportedPath]);

  return (
    <div
      className="wr-shell"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes("Files")) event.preventDefault();
      }}
      onDrop={(event) => void handleDrop(event)}
    >
      {desktop ? null : (
        <header className="wr-topbar">
          <div className="wr-brand">
            <span className="wr-brand-mark" aria-hidden="true">
              W
            </span>
            <span className="wr-brand-name">Writara</span>
          </div>

          <MenuBar menus={menus} onCommand={runCommand} />

          <div className="wr-titlebar-doc" title={doc.path ?? doc.name}>
            <span className="wr-titlebar-doc-name">{doc.name}</span>
            {doc.dirty ? <span className="wr-titlebar-doc-dot" title="有未保存的修改" aria-label="有未保存的修改" /> : null}
          </div>

          <div className="wr-actions">
            <button
              type="button"
              className="wr-icon-button"
              onClick={() => setPaletteOpen(true)}
              aria-label="命令面板"
              title="命令面板 (Ctrl+P)"
            >
              <SearchIcon />
            </button>
            <button
              type="button"
              className={doc.dirty ? "wr-icon-button is-dirty" : "wr-icon-button"}
              onClick={() => void doc.save(liveText())}
              disabled={doc.saving}
              aria-label="保存"
              title="保存 (Ctrl+S)"
            >
              <SaveIcon />
            </button>
            <button
              type="button"
              className="wr-icon-button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenuAt(rect.right - 220, rect.bottom + 6, exportMenuItems());
              }}
              aria-label="导出"
              title="导出"
            >
              <ExportIcon />
            </button>
            <span className="wr-actions-divider" aria-hidden="true" />
            <button
              type="button"
              className="wr-icon-button"
              onClick={() => openSettings()}
              aria-label="偏好设置"
              title="偏好设置 (Ctrl+,)"
            >
              <SlidersIcon />
            </button>
            <button
              type="button"
              className="wr-icon-button wr-topbar-more"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                openMenuAt(rect.right - 240, rect.bottom + 6, moreMenuItems());
              }}
              aria-label="更多"
              title="更多"
            >
              ⋯
            </button>
          </div>
        </header>
      )}

      {externalChange || banner || updater.visible ? (
        <div className="wr-banner-stack">
          {externalChange ? (
            <div className="wr-banner" role="status">
              <span className="wr-banner-text">
                这个文件在 Writara 之外被修改过，而当前还有未保存的修改。
              </span>
              <span className="wr-banner-actions">
                <button
                  type="button"
                  className="wr-button"
                  onClick={() => {
                    const target = externalChange;
                    setExternalChange(null);
                    void reloadFromDisk(target);
                  }}
                >
                  重新加载
                </button>
                <button type="button" className="wr-button" onClick={() => setExternalChange(null)}>
                  保留我的
                </button>
              </span>
            </div>
          ) : null}

          {banner ? (
            <div className={bannerIsError ? "wr-banner is-error" : "wr-banner"} role="status">
              <span>{banner}</span>
              <button
                type="button"
                className="wr-banner-close"
                aria-label="关闭提示"
                onClick={() => {
                  doc.dismissNotice();
                  doc.dismissError();
                  workspace.dismissError();
                  setFileError(null);
                }}
              >
                ×
              </button>
            </div>
          ) : null}

          <UpdateBanner
            status={updater.status}
            visible={updater.visible}
            onDownload={updater.download}
            onInstall={updater.install}
            onDismiss={updater.dismiss}
          />
        </div>
      ) : null}

      <FindBar
        open={findOpen}
        focusTarget={findFocus}
        query={findQuery}
        replacement={findReplacement}
        caseSensitive={findCase}
        regex={findRegex}
        wholeWord={findWholeWord}
        inSelection={findInSelection}
        selectionLength={findScope ? findScope.to - findScope.from : 0}
        matchCount={findMatchesList.length}
        activeIndex={findActive}
        invalidRegex={findInvalidRegex}
        onQueryChange={setFindQuery}
        onReplacementChange={setFindReplacement}
        onToggleCase={() => setFindCase((value) => !value)}
        onToggleRegex={() => setFindRegex((value) => !value)}
        onToggleWholeWord={() => setFindWholeWord((value) => !value)}
        onToggleSelection={() => setFindInSelection((value) => !value)}
        onPrevious={findPrevious}
        onNext={findNext}
        onReplace={replaceCurrent}
        onReplaceAll={replaceAll}
        onClose={closeFind}
      />

      <div className={`wr-body${narrow ? " is-drawer" : ""}${panelsFloat ? " is-float" : ""}`}>
        {narrow && sidebarVisible ? (
          <div
            className="wr-drawer-backdrop"
            aria-hidden="true"
            onMouseDown={() => setSidebarVisible(false)}
          />
        ) : null}
        {sidebarVisible ? (
          <div className={`wr-panel wr-panel-side${narrow || panelsFloat ? " is-float" : ""}`}>
            <Sidebar
              mode={sidebarMode}
              onMode={setSidebarMode}
              outline={outline}
              onJump={(pos) => {
                editorRef.current?.goTo(pos);
                if (narrow) setSidebarVisible(false);
              }}
              workspace={workspace}
              onOpenFile={(file) => {
                void openWorkspaceFile(file);
                if (narrow) setSidebarVisible(false);
              }}
              onCreateFile={() => void createWorkspaceFile()}
              onRename={(file, name) => void renameWorkspaceFile(file, name)}
              onDeleteFile={(file) => void deleteWorkspaceFile(file)}
              onSearch={() => setSearchOpen(true)}
              onFileMenu={(file, event) => openMenuAt(event.clientX, event.clientY, fileMenuItems(file))}
              onOpenAsset={(asset) => void openWorkspaceAsset(asset)}
              onAssetMenu={(asset, event) =>
                openMenuAt(event.clientX, event.clientY, assetMenuItems(asset))
              }
              onFolderMenu={(node, event) =>
                openMenuAt(event.clientX, event.clientY, folderMenuItems(node.path))
              }
              onBlankMenu={(event) => openMenuAt(event.clientX, event.clientY, blankTreeMenuItems())}
              onWorkspaceMenu={(event) => openMenuAt(event.clientX, event.clientY, blankTreeMenuItems())}
              activePath={activeTreePath}
              drawer={narrow}
              maxWidth={sidebarMaxWidth}
              onWidthChange={setSidebarWidth}
              onClose={narrow || panelsFloat ? () => setSidebarVisible(false) : undefined}
            />
          </div>
        ) : null}

        <div className="wr-scroll">
          <main className="wr-canvas" onContextMenu={handleEditorContextMenu}>
            <MarkdownEditor ref={editorRef} initialDoc={doc.text} onChange={doc.setText} onSelectionChange={setSelectedText} />
          </main>
        </div>

        <div className={`wr-panel wr-panel-chat${panelsFloat ? " is-float" : ""}`}>
          <ChatPanel
            open={chatOpen}
            onToggle={() => setChatOpen((value) => !value)}
            controller={chat}
            modelLabel={chatModelLabel}
            onOpenSettings={() => openSettings("ai")}
            model={chatModel}
            models={chatModels}
            modelsLoading={chatModelsLoading}
            onModelChange={(model) => {
              const key = settings.aiAgentId.startsWith("cli:")
                ? settings.aiAgentId.slice(4)
                : "api";
              setSettings((current) => ({
              ...current,
              aiAgentModels: { ...current.aiAgentModels, [key]: model },
            }));
          }}
          onRefreshModels={() => setChatModelsNonce((value) => value + 1)}
          width={chatWidth}
          onWidthChange={clampChatWidth}
        />
        </div>
      </div>

      {contextMenu ? (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={closeContextMenu}
        />
      ) : null}

      {statusBar ? (
        <footer className="wr-statusbar">
          {desktop ? (
            <span className="wr-file">
              {doc.name}
              {doc.dirty ? (
                <span className="wr-dirty" title="有未保存的修改" aria-label="有未保存的修改">
                  ●
                </span>
              ) : null}
            </span>
          ) : null}
          <span className="wr-stat-words">{stats.words} 字</span>
          <span className="wr-stat-chars">{stats.chars} 字符</span>
          {selectedText.trim() ? <span className="wr-selected wr-stat-selected">{countWords(selectedText)} 字（选中）</span> : null}
          <span className="wr-stat-minutes">约 {stats.minutes} 分钟</span>
          {!isDefaultFormat(doc.format) ? (
            <button
              type="button"
              className="wr-stat-encoding"
              title={`文件编码：${formatLabel(doc.format)}。点击改存为 UTF-8`}
              onClick={() => void doc.convertToUtf8()}
            >
              {formatLabel(doc.format)}
            </button>
          ) : null}

          <div className="wr-modes" role="group" aria-label="视图">
            <button
              type="button"
              className={`wr-sidebar-toggle${sidebarVisible ? " is-on" : ""}`}
              aria-pressed={sidebarVisible}
              onClick={() => setSidebarVisible((value) => !value)}
              title="侧边栏 (Ctrl+Shift+L)"
            >
              侧栏
            </button>
            <button
              type="button"
              className={modes.source ? "is-on" : ""}
              aria-pressed={modes.source}
              onClick={() => setModes((current) => ({ ...current, source: !current.source }))}
              title="源代码模式 (Ctrl+/)"
            >
              源码
            </button>
            <button
              type="button"
              className={modes.focus ? "is-on" : ""}
              aria-pressed={modes.focus}
              onClick={() => setModes((current) => ({ ...current, focus: !current.focus }))}
              title="专注模式 (F8)"
            >
              专注
            </button>
            <button
              type="button"
              className={modes.typewriter ? "is-on" : ""}
              aria-pressed={modes.typewriter}
              onClick={() => setModes((current) => ({ ...current, typewriter: !current.typewriter }))}
              title="打字机模式 (F9)"
            >
              打字机
            </button>
            <button type="button" className="wr-mode-action" onClick={() => openFind("query")} title="查找替换 (Ctrl+F)">
              查找
            </button>
          </div>

          <span className={doc.dirty ? "wr-save-state is-dirty" : "wr-save-state"}>
            {savedLabel}
            {doc.canWrite ? "" : " · 仅下载"}
          </span>
        </footer>
      ) : null}

      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      <SearchDialog
        open={searchOpen}
        files={workspace.files}
        read={(file) => workspace.read(file).then((content) => content.text)}
        onOpen={(file, offset) => void openSearchResult(file, offset)}
        onClose={() => setSearchOpen(false)}
      />
      <HelpDialog
        mode={helpMode}
        onClose={() => setHelpMode(null)}
        update={desktop ? updater : undefined}
      />
      <AiReview
        state={ai.panel}
        onAdopt={ai.adopt}
        onClose={ai.close}
        onStop={ai.stop}
        onDraftStart={ai.startDraft}
        onOutlineText={outlinePrompt}
      />
      <CheckReportPanel
        report={checkReport}
        onClose={() => setCheckReport(null)}
        onJump={jumpToIssue}
        onFixAll={() => {
          const profile = checkReport?.profile ?? checkProfile;
          if (fixAutoIssues(profile) > 0) runDocumentCheck(profile);
        }}
        onRerun={() => runDocumentCheck(checkReport?.profile ?? checkProfile)}
        onCopy={copyCheckReport}
        onProfileChange={(profile) => runDocumentCheck(profile)}
      />
      {briefOpen ? (
        <BriefPanel
          brief={brief}
          onChange={updateBrief}
          onStart={() => void startBriefDraft()}
          onClose={() => setBriefOpen(false)}
          docNonEmpty={Boolean(liveText().trim())}
        />
      ) : null}
      <ProposalPanel
        items={proposals}
        onClose={() => setProposals(null)}
        onAccept={(view) => void acceptProposal(view)}
        onReload={() => void reloadProposals()}
      />
      <ConfirmDialog request={confirmRequest} onSettle={settleConfirm} />
      <Toaster />
      <BusyOverlay message={busyMessage} />
      <PromptDialog
        request={promptState}
        onSubmit={(value) => settlePrompt(value)}
        onCancel={() => settlePrompt(null)}
      />
      <ProjectDialog
        request={projectDraft?.request ?? null}
        onSubmit={(draft) => void submitProject(draft)}
        onCancel={() => setProjectDraft(null)}
      />
      <ProjectSettings
        request={projectSettings}
        files={workspace.files}
        onSubmit={(manifest) => void submitProjectSettings(manifest)}
        onCancel={() => setProjectSettings(null)}
      />
      <ProjectAiDialog
        request={projectAi}
        run={runProjectAi}
        apply={applyProjectAi}
        onClose={() => setProjectAi(null)}
      />
      <Preferences
        open={settingsOpen}
        settings={settings}
        onChange={setSettings}
        onAction={handlePreferenceAction}
        onClose={() => {
          setSettingsOpen(false);
          setSettingsSection(undefined);
        }}
        initialSection={settingsSection}
      />
    </div>
  );
}
