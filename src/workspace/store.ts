/**
 * 工作区根目录 / 图片根目录的持久化（与文档会话分开存，避免互相覆盖）。
 *
 * 存的是平台层序列化后的身份：浏览器是目录句柄，桌面端是路径。
 */

import { platform } from "../platform";
import type { WorkspaceRoot } from "../platform/types";

const DB_NAME = "writara-workspace";
const STORE = "workspace";
const KEY = "root";
/** 单独打开文档时，相对路径图片的根目录。 */
const IMAGE_KEY = "image-root";
/** 最近打开的文件夹。 */
const RECENT_KEY = "recent-folders";

export interface RecentFolder {
  name: string;
  root: WorkspaceRoot;
  at: number;
}

export const RECENT_FOLDER_LIMIT = 8;

/** 同名的文件夹只留最新一条，与最近文件的去重口径一致。 */
export function mergeFolders(
  list: RecentFolder[],
  entry: RecentFolder,
  limit = RECENT_FOLDER_LIMIT,
): RecentFolder[] {
  const rest = list.filter((item) => item.name !== entry.name);
  return [entry, ...rest].slice(0, limit);
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readRoot(key: string): Promise<WorkspaceRoot | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const value = await toPromise<unknown>(db.transaction(STORE, "readonly").objectStore(STORE).get(key));
    db.close();
    return platform().deserializeRoot(value);
  } catch {
    return null;
  }
}

async function writeRoot(key: string, root: WorkspaceRoot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await toPromise<IDBValidKey>(
      db.transaction(STORE, "readwrite").objectStore(STORE).put(platform().serializeRoot(root), key),
    );
    db.close();
  } catch {
    // 存不下身份不影响本次会话
  }
}

async function removeRoot(key: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await toPromise<undefined>(db.transaction(STORE, "readwrite").objectStore(STORE).delete(key));
    db.close();
  } catch {
    // 忽略
  }
}

export function loadWorkspaceRoot(): Promise<WorkspaceRoot | null> {
  return readRoot(KEY);
}

export function saveWorkspaceRoot(root: WorkspaceRoot): Promise<void> {
  return writeRoot(KEY, root);
}

export function clearWorkspaceRoot(): Promise<void> {
  return removeRoot(KEY);
}

export function loadImageRoot(): Promise<WorkspaceRoot | null> {
  return readRoot(IMAGE_KEY);
}

export function saveImageRoot(root: WorkspaceRoot): Promise<void> {
  return writeRoot(IMAGE_KEY, root);
}

export function clearImageRoot(): Promise<void> {
  return removeRoot(IMAGE_KEY);
}

interface StoredFolder {
  name: string;
  root: unknown;
  at: number;
}

export async function loadRecentFolders(): Promise<RecentFolder[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    const raw = await toPromise<StoredFolder[] | undefined>(
      db.transaction(STORE, "readonly").objectStore(STORE).get(RECENT_KEY),
    );
    db.close();

    return (raw ?? [])
      .map((entry): RecentFolder | null => {
        const root = platform().deserializeRoot(entry.root);
        return root ? { name: entry.name, root, at: entry.at } : null;
      })
      .filter((entry): entry is RecentFolder => entry !== null)
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function rememberFolder(root: WorkspaceRoot): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const current = await loadRecentFolders();
    const next = mergeFolders(current, { name: root.name, root, at: Date.now() });
    const stored: StoredFolder[] = next.map((entry) => ({
      name: entry.name,
      root: platform().serializeRoot(entry.root),
      at: entry.at,
    }));

    const db = await openDb();
    await toPromise<IDBValidKey>(
      db.transaction(STORE, "readwrite").objectStore(STORE).put(stored, RECENT_KEY),
    );
    db.close();
  } catch {
    // 记不住最近文件夹不影响本次会话。
  }
}

export function clearRecentFolders(): Promise<void> {
  return removeRoot(RECENT_KEY);
}
