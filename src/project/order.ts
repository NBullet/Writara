import type { WorkspaceFile } from "../platform/types";
import { GUIDE_FILES } from "./guide";
import { MATERIAL_DIR, type ProjectManifest } from "./manifest";

/**
 * 项目正文的范围与顺序。
 *
 * 纯函数：项目设置、导出与项目大纲共用一套排序，避免「界面上是这个顺序、
 * 导出来是另一个顺序」。规则见 `docs/project-mode.md` §3 / §5。
 */

function isDirPrefix(prefix: string): boolean {
  return prefix.endsWith("/");
}

/** `exclude` 里的条目：目录以 `/` 结尾按前缀匹配，其它按完整路径匹配。 */
export function isExcludedPath(path: string, exclude: string[]): boolean {
  return exclude.some((entry) =>
    isDirPrefix(entry) ? path.startsWith(entry) : path === entry,
  );
}

function isGuidePath(path: string): boolean {
  return (GUIDE_FILES as readonly string[]).includes(path) || GUIDE_FILES.some((name) => path.endsWith(`/${name}`));
}

/** 自然序：按路径排序（扫描结果也按这个顺序，导出不依赖扫描实现）。 */
export function naturalOrder(files: WorkspaceFile[]): WorkspaceFile[] {
  return [...files].sort((a, b) => a.path.localeCompare(b.path, "zh-CN"));
}

/** 项目里的正文候选：去掉 `exclude`、指令文件与资料区。 */
export function projectDocuments(
  files: WorkspaceFile[],
  manifest: ProjectManifest | null,
): WorkspaceFile[] {
  const exclude = manifest?.exclude ?? [];
  const material = `${MATERIAL_DIR}/`;
  return naturalOrder(
    files.filter(
      (file) =>
        !isExcludedPath(file.path, exclude) &&
        !file.path.startsWith(material) &&
        !isGuidePath(file.path),
    ),
  );
}

/**
 * 按清单顺序取正文。
 *
 * `order = custom` 且 `spine` 非空时只取 `spine` 里仍存在的文件；
 * 其余情况按自然序（新加的章节不会因为忘了加进 spine 而被静默丢掉）。
 */
export function orderedDocuments(
  files: WorkspaceFile[],
  manifest: ProjectManifest | null,
): WorkspaceFile[] {
  const documents = projectDocuments(files, manifest);
  if (!manifest || manifest.order !== "custom" || manifest.spine.length === 0) return documents;

  const byPath = new Map(documents.map((file) => [file.path, file]));
  const ordered: WorkspaceFile[] = [];
  for (const path of manifest.spine) {
    const file = byPath.get(path);
    if (!file) continue;
    byPath.delete(path);
    ordered.push(file);
  }
  return ordered;
}

/** `spine` 里已经不存在于项目的条目（设置界面提示用）。 */
export function missingSpineEntries(
  files: WorkspaceFile[],
  manifest: ProjectManifest | null,
): string[] {
  if (!manifest) return [];
  const existing = new Set(files.map((file) => file.path));
  return manifest.spine.filter((path) => !existing.has(path));
}

/** 尚未加入 `spine` 的正文（设置界面「可添加」列表）。 */
export function unlistedDocuments(
  files: WorkspaceFile[],
  manifest: ProjectManifest | null,
): WorkspaceFile[] {
  const listed = new Set(manifest?.spine ?? []);
  return projectDocuments(files, manifest).filter((file) => !listed.has(file.path));
}
