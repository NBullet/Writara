import type { WorkspaceFile } from "../platform/types";

/**
 * 项目指令文件。
 *
 * 与 opencode 的 `AGENTS.md` 同一个意思：项目背景、术语表、文体与禁止项。
 * 根目录有 `WRITARA.md` 或 `AGENTS.md` 即视为项目；AI 上下文取离当前文档最近的那一份。
 * 纯函数，编辑器与导出共用一个口径。
 */

export const GUIDE_FILES = ["WRITARA.md", "AGENTS.md"] as const;

/** 同名文件在同一目录时，`WRITARA.md` 优先。 */
function guideRank(file: WorkspaceFile): number {
  return file.name === GUIDE_FILES[0] || file.path === GUIDE_FILES[0] ? 0 : 1;
}

function isGuideFile(file: WorkspaceFile): boolean {
  const name = file.path.split("/").pop() ?? "";
  return (GUIDE_FILES as readonly string[]).includes(name);
}

function dirOf(path: string): string {
  return path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
}

/** 根目录的指令文件（不认子目录里的）。 */
export function rootGuideOf(files: WorkspaceFile[]): WorkspaceFile | null {
  const root = files.filter((file) => (GUIDE_FILES as readonly string[]).includes(file.path));
  if (!root.length) return null;
  return root.sort((a, b) => guideRank(a) - guideRank(b))[0]!;
}

/**
 * 取当前文档应该用的指令文件。
 *
 * 顺序：清单 `instructions` 指向的那份 → 离文档最近的祖先目录（同名时 `WRITARA.md` 优先）
 * → 根目录那份 → 任意一份。找不到返回 null。
 */
export function findGuideFile(
  files: WorkspaceFile[],
  docPath: string | null,
  explicit = "",
): WorkspaceFile | null {
  // 清单可以指向任意路径（不必叫 WRITARA.md / AGENTS.md）。
  if (explicit) {
    const exact = files.find((file) => file.path === explicit);
    if (exact) return exact;
  }

  const candidates = files.filter(isGuideFile);
  if (!candidates.length) return null;

  if (docPath) {
    const docDir = dirOf(docPath);
    let best: WorkspaceFile | null = null;
    let bestScore = -1;
    for (const file of candidates) {
      const dir = dirOf(file.path);
      const isAncestor = dir === "" || docDir === dir || docDir.startsWith(`${dir}/`);
      if (!isAncestor) continue;
      // 目录越深越近；同一目录按 WRITARA.md 优先。
      const score = dir.length * 2 + (1 - guideRank(file));
      if (score > bestScore) {
        best = file;
        bestScore = score;
      }
    }
    if (best) return best;
  }

  return rootGuideOf(candidates);
}
