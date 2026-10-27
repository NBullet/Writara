/**
 * 最近打开的文件。
 * 身份由平台层序列化（句柄或路径）；读取时再校验，失效就提示重新打开。
 */

import { platform } from "../platform";
import type { DocRef } from "../platform/types";

export interface RecentFile {
  name: string;
  ref: DocRef;
  at: number;
}

interface StoredRecent {
  name: string;
  ref: unknown;
  at: number;
}

const DB_NAME = "writara-recent";
const STORE = "recent";
const KEY = "list";
const LIMIT = 8;

export function mergeRecent(list: RecentFile[], entry: RecentFile, limit = LIMIT): RecentFile[] {
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

export async function listRecent(): Promise<RecentFile[]> {
  if (typeof indexedDB === "undefined") return [];
  try {
    const db = await openDb();
    const list = await toPromise<StoredRecent[] | undefined>(
      db.transaction(STORE, "readonly").objectStore(STORE).get(KEY),
    );
    db.close();

    return (list ?? [])
      .map((entry): RecentFile | null => {
        const ref = platform().deserializeRef(entry.ref);
        return ref ? { name: entry.name, ref, at: entry.at } : null;
      })
      .filter((entry): entry is RecentFile => entry !== null)
      .sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}

export async function rememberRecent(ref: DocRef, name: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const current = await listRecent();
    const next = mergeRecent(current, { name, ref, at: Date.now() });
    const stored: StoredRecent[] = next.map((entry) => ({
      name: entry.name,
      ref: platform().serializeRef(entry.ref),
      at: entry.at,
    }));

    const db = await openDb();
    await toPromise<IDBValidKey>(db.transaction(STORE, "readwrite").objectStore(STORE).put(stored, KEY));
    db.close();

    window.dispatchEvent(new Event("writara:recent"));
  } catch {
    // 最近列表失败不影响编辑
  }
}

/**
 * 文件已经打不开（被移动 / 删除）时把它从最近列表里去掉：
 * 菜单里不再留着点了没反应的死条目。
 */
export async function forgetRecent(ref: DocRef): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const current = await listRecent();
    const key = nativeKey(ref);
    const next = current.filter((entry) => nativeKey(entry.ref) !== key);
    if (next.length === current.length) return;

    const stored: StoredRecent[] = next.map((entry) => ({
      name: entry.name,
      ref: platform().serializeRef(entry.ref),
      at: entry.at,
    }));

    const db = await openDb();
    await toPromise<IDBValidKey>(db.transaction(STORE, "readwrite").objectStore(STORE).put(stored, KEY));
    db.close();
    window.dispatchEvent(new Event("writara:recent"));
  } catch {
    // 清不掉不影响本次编辑
  }
}

/** 桌面端 ref 的身份是绝对路径；浏览器端只能按名字近似匹配。 */
function nativeKey(ref: DocRef): string {
  return typeof ref.native === "string" ? ref.native : ref.name;
}

export async function clearRecent(): Promise<void> {  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await toPromise<undefined>(db.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY));
    db.close();
    window.dispatchEvent(new Event("writara:recent"));
  } catch {
    // 忽略
  }
}
