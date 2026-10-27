import type { WorkspaceFile } from "../platform/types";
import { PROPOSAL_DIR } from "../workspace/config";

/**
 * 提案收件箱：外部 agent 的写入通道。
 *
 * 外部 agent（OpenCode / Claude Code / 自建）不改文件，而是往
 * `.writara/proposals/*.proposal.md` 写一份「完整新内容 + front matter」。
 * Writara 列出来、给 diff、用户点「接受」才真正写入 —— 这是「AI 改动必经审阅」
 * 在应用外也能成立的唯一办法（不用 MCP 也能接入）。
 *
 * 文件格式：
 * ---
 * proposal: chapters/03.md
 * title: 润色第三章
 * note: 只改开头两段
 * ---
 * （这里是目标文件的完整新内容）
 */

export interface Proposal {
  /** 提案文件自身的路径。 */
  path: string;
  /** 目标文件路径（相对工作区根）。 */
  target: string;
  title: string;
  note: string;
  /** 目标文件的完整新内容。 */
  content: string;
}

const FRONT_MATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function parseProposal(path: string, text: string): Proposal | null {
  const match = FRONT_MATTER.exec(text);
  if (!match) return null;
  const meta: Record<string, string> = {};
  for (const line of (match[1] ?? "").split(/\r?\n/)) {
    const entry = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line.trim());
    if (!entry) continue;
    meta[entry[1]!.toLowerCase()] = (entry[2] ?? "").trim().replace(/^['"]|['"]$/g, "");
  }
  const target = (meta.proposal ?? meta.target ?? "").replace(/^\.\//, "").trim();
  if (!target) return null;
  if (!/\.(md|markdown|mdx|txt)$/i.test(target)) return null;
  return {
    path,
    target,
    title: meta.title || target,
    note: meta.note ?? "",
    content: text.slice(match[0].length).replace(/^\r?\n/, ""),
  };
}

export function proposalFiles(files: WorkspaceFile[]): WorkspaceFile[] {
  return files.filter(
    (file) => file.path.startsWith(PROPOSAL_DIR) && file.path.endsWith(".md"),
  );
}
