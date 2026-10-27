/**
 * 上次编辑的文件。
 *
 * 存的是平台层的「不透明身份」：浏览器里是 FileSystemFileHandle，
 * 桌面端是绝对路径。两者都能被 IndexedDB 结构化克隆，所以这里不用关心形状。
 */

import { platform } from "../platform";
import type { DocRef } from "../platform/types";

export interface SessionRecord {
  ref: DocRef;
  name: string;
  /** 上次加载/保存时的文本，用来判断文件是否被外部改动。 */
  savedText: string;
  savedAt: number;
}

interface StoredSession {
  ref: unknown;
  name: string;
  savedText: string;
  savedAt: number;
}

const DB_NAME = "writara";
const DB_VERSION = 1;
const STORE = "session";
const KEY = "current";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadSession(): Promise<SessionRecord | null> {
  if (typeof indexedDB === "undefined") return null;
  try {
    const db = await openDb();
    const record = await requestToPromise<StoredSession | undefined>(
      db.transaction(STORE, "readonly").objectStore(STORE).get(KEY),
    );
    db.close();
    if (!record) return null;

    const ref = platform().deserializeRef(record.ref);
    if (!ref) return null;
    return { ref, name: record.name, savedText: record.savedText, savedAt: record.savedAt };
  } catch {
    return null;
  }
}

export async function saveSession(record: SessionRecord): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const stored: StoredSession = {
      ref: platform().serializeRef(record.ref),
      name: record.name,
      savedText: record.savedText,
      savedAt: record.savedAt,
    };
    const db = await openDb();
    await requestToPromise<IDBValidKey>(
      db.transaction(STORE, "readwrite").objectStore(STORE).put(stored, KEY),
    );
    db.close();
  } catch {
    // 存不下身份不影响本次编辑，只是下次无法自动关联文件。
  }
}

export async function clearSession(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  try {
    const db = await openDb();
    await requestToPromise<undefined>(db.transaction(STORE, "readwrite").objectStore(STORE).delete(KEY));
    db.close();
  } catch {
    // 忽略
  }
}
