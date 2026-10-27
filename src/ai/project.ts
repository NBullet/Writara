import type { WorkspaceFile } from "../platform/types";
import { findGuideFile, GUIDE_FILES } from "../project/guide";

/**
 * 项目写作规范（`WRITARA.md` / `AGENTS.md`）。
 *
 * 与 opencode 的 AGENTS.md 同一个意思：项目背景、术语表、文体与禁止项。
 * 查找顺序见 `project/guide.ts`：清单 `instructions` → 最近祖先 → 根目录。
 * 进上下文有预算，超了要截断并显式说明，不能悄悄截。
 */

export const PROJECT_FILE = GUIDE_FILES[0];

const LIMIT = 2000;

export function pickProjectFile(
  files: WorkspaceFile[],
  docPath: string | null,
  instructions = "",
): WorkspaceFile | null {
  return findGuideFile(files, docPath, instructions);
}

/** 截断到预算并标注；空文本返回空串。 */
export function clipProjectText(text: string, limit = LIMIT): string {
  const trimmed = text.trim();
  if (trimmed.length <= limit) return trimmed;
  return `${trimmed.slice(0, limit)}\n\n（项目规范过长，已截断到前 ${limit} 字）`;
}
