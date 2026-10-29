/**
 * 平台无关的文件层契约。
 *
 * 浏览器的 `FileSystemHandle` 和桌面端的绝对路径都藏在 `DocRef.native` /
 * `WorkspaceRoot.native` 里，上层（文档、工作区、最近文件）只认 `DocRef`。
 * `native` 只允许 `platform/*` 的实现读取，不要在组件或 hook 里碰它。
 */

import type { TextContent, TextFormat } from "../io/encoding";

/** 一个可以读写的文件身份。 */
export interface DocRef {
  /** 文件显示名，含扩展名。 */
  name: string;
  /** 平台私有：浏览器是 FileSystemFileHandle，桌面端是绝对路径。 */
  native: unknown;
}

/** 工作区根目录。 */
export interface WorkspaceRoot {
  name: string;
  /** 平台私有：浏览器是 FileSystemDirectoryHandle，桌面端是绝对路径。 */
  native: unknown;
}

export interface WorkspaceFile {
  name: string;
  /** 相对工作区根的路径，统一用 `/`，例如 `notes/周报.md`。 */
  path: string;
  ref: DocRef;
}

export type AssetKind = "image" | "attachment" | "other";

/** 项目资源：图片、附件与其它非 Markdown 文件。 */
export interface WorkspaceAsset {
  name: string;
  /** 相对工作区根的路径，统一用 `/`。 */
  path: string;
  kind: AssetKind;
  ref: DocRef;
}

export interface OpenedFile {
  name: string;
  text: string;
  /** 原文件的编码与 BOM；保存时原样写回（浏览器端恒为 UTF-8）。 */
  format: TextFormat;
  /** null 表示拿不到写回通道（浏览器降级用 <input type=file> 打开时）。 */
  ref: DocRef | null;
}

export interface SaveRequest {
  text: string;
  suggestedName: string;
  /** 已知文件身份；没给就弹「另存为」。 */
  ref?: DocRef | null;
  /** true：忽略已有 ref，强制弹「另存为」。 */
  forcePicker?: boolean;
  /** 写回时使用的编码；缺省 UTF-8。 */
  format?: TextFormat;
}

export type SaveOutcome =
  | { name: string; ref: DocRef; downloaded: false }
  | { name: string; ref: null; downloaded: true };

export interface ChooseFolderOptions {
  /** 浏览器用来记住上次选的目录。 */
  id?: string;
  mode?: "read" | "readwrite";
}

/**
 * 文件系统的全部能力。
 *
 * 只有两个实现：`browser.ts`（File System Access API）和 `desktop.ts`（Electron IPC）。
 * 新增文件操作时先加到这里，再补两个实现——不要在调用方写能力判断。
 */
export interface PlatformFs {
  /** 运行环境；菜单栏、关闭拦截等行为按它分支。 */
  readonly kind: "browser" | "desktop";

  /** 是否能写回原文件；false 时保存会退化成下载。 */
  readonly canWrite: boolean;

  openFile(defaultDir?: string | null): Promise<OpenedFile | null>;
  /** 按绝对路径打开（命令行参数 / 文件关联）。桌面端才有。 */
  openPath?(target: string): Promise<OpenedFile | null>;
  read(ref: DocRef): Promise<TextContent | null>;

  /** 是否已获得写权限（不会弹窗）。 */
  canWriteTo(ref: DocRef): Promise<boolean>;
  /** 在用户手势里申请权限；用于重新打开最近文件。 */
  requestAccess(ref: DocRef): Promise<boolean>;
  /**
   * 桌面端：恢复上次会话 / 最近文件时，把路径重新登记进主进程白名单。
   * 不弹窗、不读内容；浏览器端不需要（句柄本身就是权限）。
   */
  restoreAccess?(ref: DocRef): Promise<void>;
  /** 同上，目录（恢复上次的工作区）。 */
  restoreRootAccess?(root: WorkspaceRoot): Promise<void>;

  /** 保存：有 ref 直接写回，否则弹「另存为」。返回 null 表示用户取消。 */
  save(request: SaveRequest): Promise<SaveOutcome | null>;
  /** 已授权的直接写入（自动保存用，绝不弹权限框）。 */
  write(ref: DocRef, text: string, format?: TextFormat): Promise<void>;

  chooseFolder(options?: ChooseFolderOptions): Promise<WorkspaceRoot | null>;
  /** 用磁盘路径直接构造工作区根目录（桌面端「打开文件后自动加载同级目录」用）。 */
  rootFromPath?(path: string): WorkspaceRoot | null;
  /** 目录是否仍然可读写（不会弹窗）。 */
  canAccessRoot(root: WorkspaceRoot): Promise<boolean>;
  requestRootAccess(root: WorkspaceRoot): Promise<boolean>;
  scan(root: WorkspaceRoot, limits?: { depth: number; files: number; include?: string[] }): Promise<WorkspaceFile[]>;
  /** 扫描工作区里的非 Markdown 文件（图片 / 附件），供项目资源树使用。 */
  scanAssets(root: WorkspaceRoot, limits?: { depth: number; files: number }): Promise<WorkspaceAsset[]>;

  /**
   * 读取工作区里的一个配置文件（相对根的路径，例如 `.writara/project.json`）。
   * 只给清单 / 模板这类固定配置用；正文仍走 `read`，不要拿它绕开扫描。
   */
  readRootFile(root: WorkspaceRoot, path: string): Promise<TextContent | null>;
  /** 写回配置文件：父目录不存在时创建，写入走原子替换。 */
  writeRootFile(root: WorkspaceRoot, path: string, text: string): Promise<void>;
  /** 创建工作区内目录（含父级）；已存在不算错。 */
  createRootDir(root: WorkspaceRoot, path: string): Promise<void>;

  createFile(root: WorkspaceRoot, name: string): Promise<WorkspaceFile>;
  /** 删除后撤销：按相对路径与原文重建，目标已存在时不覆盖。 */
  restoreFile(root: WorkspaceRoot, path: string, text: string): Promise<WorkspaceFile>;
  renameFile(root: WorkspaceRoot, file: WorkspaceFile, name: string): Promise<WorkspaceFile>;
  deleteFile(root: WorkspaceRoot, file: WorkspaceFile): Promise<void>;

  /** 读取工作区里的图片，返回可直接放进 `<img src>` 的地址；读不到返回 null。 */
  readImage(root: WorkspaceRoot, path: string): Promise<string | null>;

  /** 把图片存到文档旁边（桌面端才有）。`path` 是写进 Markdown 的地址（相对或绝对）。 */
  saveImage?: (
    docPath: string,
    options: { target: "assets" | "current" | "path"; path?: string; relative: boolean },
    fileName: string,
    data: Uint8Array,
  ) => Promise<{ path: string; absolute: string } | null>;

  /** 持久化用：把不透明身份换成可结构化克隆的值（IndexedDB / JSON）。 */
  serializeRef(ref: DocRef): unknown;
  deserializeRef(raw: unknown): DocRef | null;
  serializeRoot(root: WorkspaceRoot): unknown;
  deserializeRoot(raw: unknown): WorkspaceRoot | null;
}
