/**
 * 桌面端实现：全部走 preload 暴露的 `window.writara.fs`。
 *
 * 与 `browser.ts` 的区别只有两点：
 * - 文件身份是绝对路径（`ref.native` 是 string），不需要句柄；
 * - 没有「权限」概念，`canWriteTo` 恒为 true。
 */

import type { DesktopBridge } from "./bridge";
import type { TextFormat } from "../io/encoding";
import { assetKindOf } from "../workspace/assets";
import type {
  DocRef,
  OpenedFile,
  PlatformFs,
  SaveOutcome,
  SaveRequest,
  WorkspaceAsset,
  WorkspaceFile,
  WorkspaceRoot,
} from "./types";

export function hasDesktopBridge(): boolean {
  return typeof window !== "undefined" && Boolean(window.writara?.desktop);
}

function bridge(): DesktopBridge {
  const api = window.writara;
  if (!api) throw new Error("桌面端接口不可用");
  return api;
}

function fileName(target: string): string {
  const parts = target.split(/[\\/]/);
  return parts[parts.length - 1] ?? target;
}

function toRef(target: string): DocRef {
  return { name: fileName(target), native: target };
}

/**
 * IPC 失败时 Electron 会把消息包成
 * `Error invoking remote method 'fs:read': Error: 文件不存在或已被移动`，
 * 这里剥掉前缀，界面只显示中文原因。
 */
async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    const raw = error instanceof Error ? error.message : String(error);
    throw new Error(raw.replace(/^Error invoking remote method '[^']*': (?:Error: )?/, ""), {
      cause: error,
    });
  }
}

export function createDesktopFs(): PlatformFs {
  const fs = () => bridge().fs;

  return {
    kind: "desktop",
    canWrite: true,

    async openFile(): Promise<OpenedFile | null> {
      const file = await call(() => fs().openFile());
      if (!file) return null;
      return {
        name: file.name,
        text: file.text,
        format: { encoding: file.encoding, bom: file.bom },
        ref: toRef(file.path),
      };
    },

    async openPath(target: string): Promise<OpenedFile | null> {
      const content = await call(() => fs().read(target));
      if (content === null) return null;
      return {
        name: fileName(target),
        text: content.text,
        format: { encoding: content.encoding, bom: content.bom },
        ref: toRef(target),
      };
    },

    read: (ref: DocRef) => call(() => fs().read(String(ref.native))),

    canWriteTo: async () => true,
    requestAccess: async () => true,

    async restoreAccess(ref: DocRef): Promise<void> {
      const target = ref.native;
      if (typeof target !== "string") return;
      await call(() => fs().authorizeRestore([target]));
    },

    async restoreRootAccess(root: WorkspaceRoot): Promise<void> {
      const target = root.native;
      if (typeof target !== "string") return;
      await call(() => fs().authorizeRestore([target]));
    },

    async save(request: SaveRequest): Promise<SaveOutcome | null> {
      const result = await call(() =>
        fs().save({
          text: request.text,
          suggestedName: request.suggestedName,
          ref: request.forcePicker || !request.ref ? null : String(request.ref.native),
          encoding: request.format?.encoding,
          bom: request.format?.bom,
        }),
      );
      if (!result) return null;
      return { name: result.name, ref: toRef(result.path), downloaded: false };
    },

    async write(ref: DocRef, text: string, format?: TextFormat): Promise<void> {
      await call(() =>
        fs().write(String(ref.native), text, { encoding: format?.encoding, bom: format?.bom }),
      );
    },

    async chooseFolder(options): Promise<WorkspaceRoot | null> {
      const root = await call(() => fs().chooseFolder({ mode: options?.mode }));
      return root ? { name: root.name, native: root.path } : null;
    },

    rootFromPath(path: string): WorkspaceRoot | null {
      return path ? { name: fileName(path), native: path } : null;
    },

    canAccessRoot: async () => true,
    requestRootAccess: async () => true,

    async scan(root: WorkspaceRoot, limits): Promise<WorkspaceFile[]> {
      const files = await call(() => fs().scan(String(root.native), limits));
      return files.map((file) => ({
        name: file.name,
        path: file.path,
        ref: toRef(file.abs),
      }));
    },

    async scanAssets(root: WorkspaceRoot, limits): Promise<WorkspaceAsset[]> {
      const assets = await call(() => fs().scanAssets(String(root.native), limits));
      return assets.map((asset) => ({
        name: asset.name,
        path: asset.path,
        kind: assetKindOf(asset.name),
        ref: toRef(asset.abs),
      }));
    },

    readRootFile: (root: WorkspaceRoot, path: string) =>
      call(() => fs().readRootFile(String(root.native), path)),

    async writeRootFile(root: WorkspaceRoot, path: string, text: string): Promise<void> {
      await call(() => fs().writeRootFile(String(root.native), path, text));
    },

    async createRootDir(root: WorkspaceRoot, path: string): Promise<void> {
      await call(() => fs().createRootDir(String(root.native), path));
    },

    async createFile(root: WorkspaceRoot, name: string): Promise<WorkspaceFile> {
      const file = await call(() => fs().createFile(String(root.native), name));
      return { name: file.name, path: file.path, ref: toRef(file.abs) };
    },

    async restoreFile(root: WorkspaceRoot, path: string, text: string): Promise<WorkspaceFile> {
      const file = await call(() => fs().restoreFile(String(root.native), path, text));
      return { name: file.name, path: file.path, ref: toRef(file.abs) };
    },

    async renameFile(root: WorkspaceRoot, file: WorkspaceFile, name: string): Promise<WorkspaceFile> {
      const next = await call(() =>
        fs().renameFile(String(root.native), { path: file.path }, name),
      );
      return { name: next.name, path: next.path, ref: toRef(next.abs) };
    },

    async deleteFile(root: WorkspaceRoot, file: WorkspaceFile): Promise<void> {
      await call(() => fs().deleteFile(String(root.native), { path: file.path }));
    },

    readImage: (root: WorkspaceRoot, path: string) =>
      call(() => fs().readImage(String(root.native), path)),

    async saveImage(
      docPath: string,
      options: { target: "assets" | "current" | "path"; path?: string; relative: boolean },
      fileName: string,
      data: Uint8Array,
    ) {
      return await call(() => fs().saveImage(docPath, options, fileName, data));
    },

    serializeRef: (ref: DocRef) => String(ref.native),
    deserializeRef: (raw: unknown) => (typeof raw === "string" && raw ? toRef(raw) : null),
    serializeRoot: (root: WorkspaceRoot) => String(root.native),
    deserializeRoot: (raw: unknown) =>
      typeof raw === "string" && raw ? { name: fileName(raw), native: raw } : null,
  };
}
