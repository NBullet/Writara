/**
 * 浏览器实现：File System Access API。
 *
 * 把句柄包成 `DocRef`，让上层不依赖 `FileSystemHandle`。
 * 桌面端（M1）用同名的 `desktop.ts` 实现同一份 `PlatformFs`。
 */

import {
  downloadMarkdown,
  ensureWriteAccess,
  hasWritePermission,
  normalizeFileName,
  openDocument,
  pickSaveHandle,
  readDocument,
  supportsDiskAccess,
  writeDocumentHandle,
} from "../io/file-system";
import { fileToDataUrl } from "../io/image-resolver";
import { DEFAULT_FORMAT, type TextContent } from "../io/encoding";
import { getFileByPath, safeRelativePath } from "../workspace/paths";
import { assetKindOf } from "../workspace/assets";
import { scanAssets, scanDirectory } from "../workspace/scan";
import type {
  ChooseFolderOptions,
  DocRef,
  OpenedFile,
  PlatformFs,
  SaveOutcome,
  SaveRequest,
  WorkspaceAsset,
  WorkspaceFile,
  WorkspaceRoot,
} from "./types";

function refOf(handle: FileSystemFileHandle): DocRef {
  return { name: handle.name, native: handle };
}

function handleOf(ref: DocRef): FileSystemFileHandle {
  return ref.native as FileSystemFileHandle;
}

function rootOf(root: WorkspaceRoot): FileSystemDirectoryHandle {
  return root.native as FileSystemDirectoryHandle;
}

function rootOfHandle(handle: FileSystemDirectoryHandle): WorkspaceRoot {
  return { name: handle.name, native: handle };
}

/** 补全扩展名，和工作区新建文件保持一致。 */
function markdownName(name: string, fallback = "未命名"): string {
  const trimmed = name.trim() || fallback;
  return /\.(md|markdown|mdx)$/i.test(trimmed) ? trimmed : `${trimmed}.md`;
}

function parentPath(path: string): string {
  return path.split("/").slice(0, -1).join("/");
}

/** 配置路径先过一遍越界校验，再交给目录句柄。 */
function rootPath(path: string): string {
  const value = safeRelativePath(path);
  if (!value) throw new Error("路径无效");
  return value;
}

export function createBrowserFs(): PlatformFs {
  return {
    kind: "browser",
    canWrite: supportsDiskAccess(),

    async openFile(): Promise<OpenedFile | null> {
      const file = await openDocument();
      if (!file) return null;
      return {
        name: file.name,
        text: file.text,
        format: DEFAULT_FORMAT,
        ref: file.handle ? refOf(file.handle) : null,
      };
    },

    async read(ref: DocRef): Promise<TextContent | null> {
      const text = await readDocument(handleOf(ref));
      return text === null ? null : { text, ...DEFAULT_FORMAT };
    },

    canWriteTo(ref: DocRef): Promise<boolean> {
      return hasWritePermission(handleOf(ref));
    },

    async requestAccess(ref: DocRef): Promise<boolean> {
      try {
        return await ensureWriteAccess(handleOf(ref));
      } catch {
        return false;
      }
    },

    async save(request: SaveRequest): Promise<SaveOutcome | null> {
      const existing = !request.forcePicker && request.ref ? request.ref : null;
      const handle = existing ? handleOf(existing) : await pickSaveHandle(request.suggestedName);

      if (!handle) {
        // 已有句柄却取不到：等同取消。完全没有 API：退化成下载。
        if (existing || window.showSaveFilePicker) return null;
        downloadMarkdown(request.suggestedName, request.text);
        return {
          name: normalizeFileName(request.suggestedName),
          ref: null,
          downloaded: true,
        };
      }

      if (!(await writeDocumentHandle(handle, request.text))) {
        throw new Error("没有写入该文件的权限");
      }
      return { name: handle.name, ref: refOf(handle), downloaded: false };
    },

    async write(ref: DocRef, text: string): Promise<void> {
      // 浏览器端只有 UTF-8：TextEncoder 不能编码 GBK，写入恒为 UTF-8。
      if (!(await writeDocumentHandle(handleOf(ref), text))) {
        throw new Error("没有写入该文件的权限");
      }
    },

    async chooseFolder(options: ChooseFolderOptions = {}): Promise<WorkspaceRoot | null> {
      if (!window.showDirectoryPicker) {
        throw new Error("当前浏览器不支持打开文件夹，请用 Chrome / Edge。");
      }
      try {
        const handle = await window.showDirectoryPicker({
          mode: options.mode ?? "readwrite",
          id: options.id,
        });
        return rootOfHandle(handle);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return null;
        throw error;
      }
    },

    async canAccessRoot(root: WorkspaceRoot): Promise<boolean> {
      const handle = rootOf(root);
      if (!handle.queryPermission) return false;
      try {
        return (await handle.queryPermission({ mode: "readwrite" })) === "granted";
      } catch {
        return false;
      }
    },

    async requestRootAccess(root: WorkspaceRoot): Promise<boolean> {
      const handle = rootOf(root);
      if (!handle.requestPermission) return false;
      try {
        return (await handle.requestPermission({ mode: "readwrite" })) === "granted";
      } catch {
        return false;
      }
    },

    async scan(root: WorkspaceRoot, limits): Promise<WorkspaceFile[]> {
      const files = await scanDirectory(rootOf(root), limits);
      return files.map((file) => ({
        name: file.name,
        path: file.path,
        ref: refOf(file.handle),
      }));
    },

    async scanAssets(root: WorkspaceRoot, limits): Promise<WorkspaceAsset[]> {
      const assets = await scanAssets(rootOf(root), limits);
      return assets.map((asset) => ({
        name: asset.name,
        path: asset.path,
        kind: assetKindOf(asset.name),
        ref: refOf(asset.handle),
      }));
    },

    async readRootFile(root: WorkspaceRoot, path: string): Promise<TextContent | null> {
      const handle = await getFileByPath(rootOf(root), rootPath(path));
      if (!handle) return null;
      try {
        const file = await handle.getFile();
        return { text: await file.text(), ...DEFAULT_FORMAT };
      } catch {
        return null;
      }
    },

    async writeRootFile(root: WorkspaceRoot, path: string, text: string): Promise<void> {
      const parts = rootPath(path).split("/");
      const name = parts[parts.length - 1]!;
      let dir = rootOf(root);
      for (const part of parts.slice(0, -1)) {
        dir = await dir.getDirectoryHandle(part, { create: true });
      }
      const handle = await dir.getFileHandle(name, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
    },

    async createRootDir(root: WorkspaceRoot, path: string): Promise<void> {
      let dir = rootOf(root);
      for (const part of rootPath(path).split("/")) {
        dir = await dir.getDirectoryHandle(part, { create: true });
      }
    },

    async createFile(root: WorkspaceRoot, name: string): Promise<WorkspaceFile> {
      const fileName = markdownName(name);
      // 先按「不创建」试一遍：能拿到句柄说明同名文件已存在，不能静默清空它。
      const exists = await rootOf(root)
        .getFileHandle(fileName)
        .then(
          () => true,
          () => false,
        );
      if (exists) throw new Error(`已经有同名文件：${fileName}`);
      const handle = await rootOf(root).getFileHandle(fileName, { create: true });
      const text = `# ${fileName.replace(/\.md$/i, "")}\n\n`;
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { name: fileName, path: fileName, ref: refOf(handle) };
    },

    async restoreFile(root: WorkspaceRoot, path: string, text: string): Promise<WorkspaceFile> {
      const parts = path.split("/").filter(Boolean);
      const fileName = parts.pop();
      if (!fileName) throw new Error("路径无效");
      let dir = rootOf(root);
      for (const part of parts) dir = await dir.getDirectoryHandle(part, { create: true });
      const exists = await dir.getFileHandle(fileName).then(
        () => true,
        () => false,
      );
      if (exists) throw new Error(`文件已存在：${path}`);
      const handle = await dir.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      await writable.write(text);
      await writable.close();
      return { name: fileName, path, ref: refOf(handle) };
    },

    async renameFile(_root: WorkspaceRoot, file: WorkspaceFile, name: string): Promise<WorkspaceFile> {
      const handle = handleOf(file.ref);
      if (!handle.move) {
        throw new Error("当前浏览器不支持重命名，请用 Chrome / Edge 的最新版本。");
      }
      const nextName = markdownName(name, file.name);
      await handle.move(nextName);
      const dir = parentPath(file.path);
      return {
        name: nextName,
        path: dir ? `${dir}/${nextName}` : nextName,
        ref: { name: nextName, native: handle },
      };
    },

    async deleteFile(_root: WorkspaceRoot, file: WorkspaceFile): Promise<void> {
      const handle = handleOf(file.ref);
      if (!handle.remove) {
        throw new Error("当前浏览器不支持删除，请用 Chrome / Edge 的最新版本。");
      }
      await handle.remove();
    },

    async readImage(root: WorkspaceRoot, path: string): Promise<string | null> {
      const handle = await getFileByPath(rootOf(root), path);
      if (!handle) return null;
      try {
        return await fileToDataUrl(await handle.getFile());
      } catch {
        return null;
      }
    },

    serializeRef(ref: DocRef): unknown {
      return ref.native;
    },

    deserializeRef(raw: unknown): DocRef | null {
      if (!raw) return null;
      const handle = raw as FileSystemFileHandle;
      if (typeof handle.name !== "string") return null;
      return { name: handle.name, native: handle };
    },

    serializeRoot(root: WorkspaceRoot): unknown {
      return root.native;
    },

    deserializeRoot(raw: unknown): WorkspaceRoot | null {
      if (!raw) return null;
      const handle = raw as FileSystemDirectoryHandle;
      if (typeof handle.name !== "string") return null;
      return { name: handle.name, native: handle };
    },
  };
}
