import type { MenuState } from "../commands/menus";
import type { TextEncoding } from "../io/encoding";
import type { UpdateStatus } from "../updates/types";

/** 主进程通过 `fs:scan` 返回的条目。 */
export interface DesktopScannedFile {
  name: string;
  /** 相对工作区根，用 `/` 分隔。 */
  path: string;
  /** 绝对路径，渲染进程把它当成文件身份。 */
  abs: string;
}

export interface DesktopSaveResult {
  name: string;
  path: string;
}

/** 主进程检测到的本机 agent CLI。 */
export interface DetectedAgentInfo {
  id: string;
  name: string;
  path: string | null;
  version: string | null;
  available: boolean;
  runnable: boolean;
  fallbackModels: string[];
}

export interface AgentRunRequest {
  runId: string;
  agentId: string;
  model?: string;
  task: string;
  document: string;
  project?: string;
  selection?: string;
  timeoutMs?: number;
  /** 项目任务：一次改多个文件。 */
  files?: Array<{ path: string; text: string }>;
}

export interface AgentRunResponse {
  ok: boolean;
  message: string;
  document: string;
  changed: boolean;
  durationMs: number;
  error?: string;
  stdout?: string;
  stderr?: string;
  files?: Array<{ path: string; text: string }>;
}

/** preload 暴露在 `window.writara` 上的全部能力。 */
export interface DesktopBridge {
  readonly desktop: true;
  readonly platform: string;

  fs: {
    openFile(): Promise<{
      path: string;
      name: string;
      text: string;
      encoding: TextEncoding;
      bom: boolean;
    } | null>;
    read(target: string): Promise<{
      text: string;
      encoding: TextEncoding;
      bom: boolean;
    } | null>;
    save(request: {
      text: string;
      suggestedName: string;
      ref?: string | null;
      forcePicker?: boolean;
      encoding?: TextEncoding;
      bom?: boolean;
    }): Promise<DesktopSaveResult | null>;
    write(
      target: string,
      text: string,
      format?: { encoding?: TextEncoding; bom?: boolean },
    ): Promise<boolean>;
    /** 恢复上次会话 / 最近列表时，把路径重新加进主进程白名单。 */
    authorizeRestore(paths: string[]): Promise<boolean>;
    chooseFolder(options?: {
      mode?: "read" | "readwrite";
      id?: string;
    }): Promise<{ name: string; path: string } | null>;
    scan(root: string, limits?: { depth: number; files: number }): Promise<DesktopScannedFile[]>;
    /** 非 Markdown 资源（图片 / 附件）。 */
    scanAssets(root: string, limits?: { depth: number; files: number }): Promise<DesktopScannedFile[]>;
    /** 工作区内的配置文件（项目清单等）。 */
    readRootFile(root: string, path: string): Promise<{
      text: string;
      encoding: TextEncoding;
      bom: boolean;
    } | null>;
    writeRootFile(root: string, path: string, text: string): Promise<boolean>;
    createRootDir(root: string, path: string): Promise<boolean>;
    createFile(root: string, name: string): Promise<DesktopScannedFile>;
    restoreFile(root: string, path: string, text: string): Promise<DesktopScannedFile>;
    renameFile(root: string, file: { path: string }, name: string): Promise<DesktopScannedFile>;
    deleteFile(root: string, file: { path: string }): Promise<boolean>;
    readImage(root: string, path: string): Promise<string | null>;
    /** 把图片写到文档旁边，返回写进 Markdown 的地址与实际路径。 */
    saveImage(
      docPath: string,
      options: { target: "assets" | "current" | "path"; path?: string; relative: boolean },
      fileName: string,
      data: Uint8Array,
    ): Promise<{ path: string; absolute: string }>;
    reveal(target: string): Promise<boolean>;
  };

  shell: {
    openExternal(url: string): Promise<boolean>;
    /** 用系统默认程序打开（导出后「打开 PDF」）。 */
    openPath(target: string): Promise<boolean>;
    /** 在资源管理器 / Finder 里定位文件。 */
    showItemInFolder(target: string): Promise<boolean>;
  };

  menu: {
    updateState(state: Partial<MenuState>): Promise<boolean>;
  };

  ai: {
    /** 检测 PATH 上的 coding-agent CLI（缓存 60s）。 */
    detect(force?: boolean): Promise<DetectedAgentInfo[]>;
    /** 某个 CLI 的模型列表（能列就列，否则静态提示）。 */
    models(agentId: string): Promise<string[]>;
    /** 在临时工作目录里跑一次 agent，返回修改后的文档。 */
    run(payload: AgentRunRequest): Promise<AgentRunResponse>;
    /** 取消正在运行的 agent。 */
    cancel(runId: string): Promise<boolean>;
  };

  pdf: {
    /** 渲染好的单文件 HTML → 系统保存对话框 → 写 PDF。取消返回 null。 */
    export(request: {
      html: string;
      suggestedName: string;
      pageNumbers?: boolean;
      pageRanges?: string;
      metadata?: { title?: string; author?: string; subject?: string };
    }): Promise<{ path: string } | null>;
    /** 打印预览：渲染成临时 PDF 并打开内置阅读器。 */
    preview(request: {
      html: string;
      suggestedName: string;
      pageNumbers?: boolean;
      pageRanges?: string;
      metadata?: { title?: string; author?: string; subject?: string };
    }): Promise<{ path: string } | null>;
  };

  store: {
    /** 同步读取应用数据（设置等），启动时用。 */
    read(): Record<string, unknown>;
    /** 合并写入应用数据。 */
    write(patch: Record<string, unknown>): Promise<boolean>;
  };

  updates: {
    /** 当前更新状态（晚挂载的渲染进程用它对齐）。 */
    status(): Promise<UpdateStatus>;
    /** 手动检查一次；结果通过 onStatus 推送。 */
    check(): Promise<UpdateStatus>;
    /** 开始下载已发现的版本。 */
    download(): Promise<boolean>;
    /** 退出并安装已下载的版本。 */
    install(): Promise<boolean>;
    /** 订阅状态变化；返回取消订阅函数。 */
    onStatus(callback: (status: UpdateStatus) => void): () => void;
  };

  spell: {
    /** 系统可用的拼写检查语言（BCP-47）。 */
    languages(): Promise<string[]>;
    set(languages: string[]): Promise<boolean>;
  };

  pandoc: {
    /** 探测 Pandoc；`configured` 为空则按常见安装位置查找。 */
    detect(configured?: string): Promise<{ path: string; version: string } | null>;
    /** Markdown → docx / epub，返回实际写入路径；取消返回 null。 */
    export(request: {
      markdown: string;
      suggestedName: string;
      format: "docx" | "epub";
      pandocPath?: string;
      resourceDir?: string;
      title?: string;
      /** 内置模板 id（`resources/templates/*.docx`）。 */
      template?: "writara-cn" | "gongwen" | "tech" | "custom";
      /** `template === "custom"` 时的模板绝对路径。 */
      customTemplate?: string;
      toc?: boolean;
      numberSections?: boolean;
      pageNumbers?: boolean;
    }): Promise<{ path: string } | null>;
  };

  setDirty(value: boolean): void;
  /** 渲染进程订阅好事件之后再通知主进程，避免命令行文件的消息丢失。 */
  shellReady(): void;
  replyClose(ok: boolean): void;
  newWindow(): Promise<boolean>;

  onMenuCommand(callback: (id: string) => void): () => void;
  onOpenFile(callback: (target: string) => void): () => void;
  /** 当前文档在磁盘上被外部修改（路径为绝对路径）。 */
  onFileChanged(callback: (target: string) => void): () => void;
  /** 工作区目录里增删了 Markdown 文件。 */
  onWorkspaceChanged(callback: (root: string) => void): () => void;
  onCloseRequest(callback: () => void): () => void;
}

declare global {
  interface Window {
    writara?: DesktopBridge;
  }
}
