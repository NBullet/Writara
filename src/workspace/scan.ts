/** 工作区：一个文件夹里的 Markdown 文件。 */
export interface ScannedFile {
  name: string;
  /** 相对文件夹的路径，例如 `notes/周报.md`。 */
  path: string;
  handle: FileSystemFileHandle;
}

const SKIP_DIRS = new Set(["node_modules", "dist", "dev-dist", ".git", ".obsidian"]);

export interface ScanLimits {
  depth: number;
  files: number;
  /** 额外包含的隐藏目录名（例如 `.writara`）；`.git` 等始终跳过。 */
  include?: string[];
}

export function isMarkdownPath(name: string): boolean {
  return /\.(md|markdown|mdx|txt)$/i.test(name);
}

export interface ScannedAsset {
  name: string;
  path: string;
  handle: FileSystemFileHandle;
}

/** 与 Markdown 扫描同一套目录规则，只收非 Markdown 文件。 */
export async function scanAssets(
  root: FileSystemDirectoryHandle,
  limits: ScanLimits = { depth: 4, files: 600 },
): Promise<ScannedAsset[]> {
  const files: ScannedAsset[] = [];
  const include = new Set(limits.include ?? []);

  async function walk(directory: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > limits.depth || files.length >= limits.files) return;

    for await (const entry of directory.values()) {
      if (files.length >= limits.files) return;
      const name = entry.name;
      if (SKIP_DIRS.has(name)) continue;
      if (name.startsWith(".") && !include.has(name)) continue;

      if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
        continue;
      }

      if (isMarkdownPath(name)) continue;
      files.push({ name, path: `${prefix}${name}`, handle: entry as FileSystemFileHandle });
    }
  }

  await walk(root, "", 0);
  return files.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

/** 递归扫描，最多 4 层、300 个文件，跳过隐藏目录与构建产物。 */
export async function scanDirectory(
  root: FileSystemDirectoryHandle,
  limits: ScanLimits = { depth: 4, files: 300 },
): Promise<ScannedFile[]> {
  const files: ScannedFile[] = [];
  const include = new Set(limits.include ?? []);

  async function walk(directory: FileSystemDirectoryHandle, prefix: string, depth: number): Promise<void> {
    if (depth > limits.depth || files.length >= limits.files) return;

    for await (const entry of directory.values()) {
      if (files.length >= limits.files) return;
      const name = entry.name;
      if (SKIP_DIRS.has(name)) continue;
      if (name.startsWith(".") && !include.has(name)) continue;

      if (entry.kind === "directory") {
        await walk(entry as FileSystemDirectoryHandle, `${prefix}${name}/`, depth + 1);
        continue;
      }

      if (!isMarkdownPath(name)) continue;
      files.push({ name, path: `${prefix}${name}`, handle: entry as FileSystemFileHandle });
    }
  }

  await walk(root, "", 0);
  return files.sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}
