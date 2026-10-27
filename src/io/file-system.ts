/**
 * 文件读写。
 *
 * 优先走 File System Access API（Chromium），这样 Ctrl+S 能写回原文件；
 * 其他浏览器降级为「下载副本」，并在界面上说明差别。
 */

export interface OpenedDocument {
  name: string;
  text: string;
  handle: FileSystemFileHandle | null;
}

export interface SaveResult {
  name: string;
  handle: FileSystemFileHandle | null;
  /** true 表示没有写盘能力，退化成下载。 */
  downloaded: boolean;
}

const MARKDOWN_TYPES: FilePickerType[] = [
  { description: "Markdown", accept: { "text/markdown": [".md", ".markdown", ".mdx", ".txt"] } },
];

type PermissionCapableHandle = FileSystemFileHandle & {
  queryPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "readwrite" }) => Promise<PermissionState>;
};

export function supportsDiskAccess(): boolean {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

/** 统一文件名：没有扩展名时补 .md。 */
export function normalizeFileName(name: string): string {
  const trimmed = name.trim() || "未命名.md";
  return /\.(md|markdown|mdx|txt)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** 给用户看的错误文案，不要把 DOMException 原文丢到界面上。 */
export function describeFileError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") return "没有文件访问权限";
    if (error.name === "NotFoundError") return "文件不存在或已被移动";
    if (error.name === "NotReadableError") return "文件被其他程序占用";
    if (error.name === "QuotaExceededError") return "磁盘空间不足";
  }
  if (error instanceof Error && error.message) return error.message;
  return "文件操作失败";
}

export async function openDocument(): Promise<OpenedDocument | null> {
  if (supportsDiskAccess() && window.showOpenFilePicker) {
    try {
      const [handle] = await window.showOpenFilePicker({ types: MARKDOWN_TYPES, multiple: false });
      if (!handle) return null;
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (error) {
      if (isAbort(error)) return null;
      throw error;
    }
  }

  // 回退：<input type="file">，没有写回能力。
  return new Promise((resolve, reject) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".md,.markdown,.mdx,.txt,text/markdown";
    input.addEventListener("change", () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then(
        (text) => resolve({ name: file.name, text, handle: null }),
        (error: unknown) => reject(error),
      );
    });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/** 读取句柄对应的文件内容；文件被删除时返回 null。 */
export async function readDocument(handle: FileSystemFileHandle): Promise<string | null> {
  try {
    const file = await handle.getFile();
    return await file.text();
  } catch (error) {
    if (error instanceof DOMException && error.name === "NotFoundError") return null;
    throw error;
  }
}

/** 句柄当前是否已获得读写权限（不会弹窗）。 */
export async function hasWritePermission(handle: FileSystemFileHandle): Promise<boolean> {
  const target = handle as PermissionCapableHandle;
  if (!target.queryPermission) return false;
  try {
    return (await target.queryPermission({ mode: "readwrite" })) === "granted";
  } catch {
    return false;
  }
}

async function ensureWritePermission(handle: PermissionCapableHandle): Promise<boolean> {
  if (!handle.queryPermission) return true;
  const state = await handle.queryPermission({ mode: "readwrite" });
  if (state === "granted") return true;
  if (!handle.requestPermission) return false;
  // requestPermission 必须发生在用户手势里（Ctrl+S / 点击保存）。
  return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
}

/** 打开最近文件前申请权限；必须在用户手势里调用。 */
export async function ensureWriteAccess(handle: FileSystemFileHandle): Promise<boolean> {
  return ensureWritePermission(handle as PermissionCapableHandle);
}

/** 弹「另存为」选位置，不写内容。用户取消返回 null。 */
export async function pickSaveHandle(suggestedName: string): Promise<FileSystemFileHandle | null> {
  if (!window.showSaveFilePicker) return null;
  try {
    return await window.showSaveFilePicker({
      suggestedName: normalizeFileName(suggestedName),
      types: MARKDOWN_TYPES,
    });
  } catch (error) {
    if (isAbort(error)) return null;
    throw error;
  }
}

/**
 * 写回一个已知句柄。权限不足时尝试申请（只能发生在用户手势里）。
 * 返回 false 表示没有写入权限。
 */
export async function writeDocumentHandle(handle: FileSystemFileHandle, text: string): Promise<boolean> {
  if (!(await ensureWritePermission(handle as PermissionCapableHandle))) return false;

  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
  return true;
}

export interface SaveOptions {
  handle?: FileSystemFileHandle | null;
  suggestedName: string;
  /** true：忽略已有句柄，强制弹「另存为」。 */
  forcePicker?: boolean;
}

/**
 * 写回原文件；没有句柄或要求另存为时弹保存对话框。
 * 用户取消返回 null。
 */
export async function saveDocument(text: string, options: SaveOptions): Promise<SaveResult | null> {
  const useExisting = !options.forcePicker && Boolean(options.handle);
  const handle: FileSystemFileHandle | null = useExisting
    ? options.handle ?? null
    : await pickSaveHandle(options.suggestedName);

  if (!handle && !useExisting) {
    // 没有 API 或用户取消：前者退化成下载，后者返回 null。
    if (!window.showSaveFilePicker) {
      downloadMarkdown(options.suggestedName, text);
      return { name: normalizeFileName(options.suggestedName), handle: null, downloaded: true };
    }
    return null;
  }

  if (!handle) {
    // 有句柄但被清空，等同取消。
    return null;
  }

  if (!(await writeDocumentHandle(handle, text))) {
    throw new Error("没有写入该文件的权限");
  }
  return { name: handle.name, handle, downloaded: false };
}

/** 浏览器不支持写盘时的兜底：下载一份副本。 */
export function downloadMarkdown(name: string, text: string): void {
  const fileName = normalizeFileName(name);
  const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
