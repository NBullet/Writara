/**
 * 工作区里的相对路径：把文档路径和图片地址合成仓库内路径。
 *
 * `getFileByPath` 是浏览器目录句柄的底层原语，只给 `platform/browser.ts` 用；
 * 桌面端在 IPC 侧按路径直接读，不经过这里。
 */

/**
 * 工作区内的相对路径（配置、清单、资料登记共用）。
 *
 * 拒绝绝对路径、盘符与任何 `..` 段：调用方拿到它再去拼平台路径，
 * 拼之前必须已经确认它不会跑出根目录。
 */
export function safeRelativePath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized) return null;
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;

  const parts = normalized.split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) return null;
  return parts.join("/");
}

export function resolveRelativePath(baseFile: string, src: string): string | null {
  const value = src.trim();
  if (!value) return null;
  // 带协议（http/data/blob/file）、协议相对、绝对路径、锚点都不处理
  if (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//") || value.startsWith("/") || value.startsWith("#")) {
    return null;
  }

  const parts = baseFile.split("/").filter(Boolean).slice(0, -1);

  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (parts.length === 0) return null;
      parts.pop();
      continue;
    }
    try {
      parts.push(decodeURIComponent(part));
    } catch {
      parts.push(part);
    }
  }

  return parts.length > 0 ? parts.join("/") : null;
}

/** 从工作区根目录逐级取文件；路径不存在返回 null。 */
export async function getFileByPath(
  root: FileSystemDirectoryHandle,
  path: string,
): Promise<FileSystemFileHandle | null> {
  const parts = path.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  let directory = root;
  try {
    for (const part of parts.slice(0, -1)) {
      directory = await directory.getDirectoryHandle(part);
    }
    return await directory.getFileHandle(parts[parts.length - 1]!);
  } catch {
    return null;
  }
}
