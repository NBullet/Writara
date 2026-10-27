import type { Settings } from "../storage/settings";
import { normalizeLineEndings } from "../io/line-endings";
import { agentContext, runAgentTask, selectedAgent, type AgentFile } from "./agent-run";

/**
 * 项目级 AI 任务：把多章原文交给本机 agent，在临时副本里修改，只读回文本。
 *
 * 不直接写用户文件：写回由审阅浮层确认（`ProjectAiDialog`）。
 */

export interface ProjectAiRunOutput {
  ok: boolean;
  message: string;
  /** 有实际改动的文件（未改动的文件不会出现在这里）。 */
  changed: AgentFile[];
  error?: string;
}

export async function runProjectTask(options: {
  settings: Settings;
  task: string;
  files: AgentFile[];
  project: string;
  onStage?: (stage: string) => void;
}): Promise<ProjectAiRunOutput> {
  const agent = selectedAgent(options.settings);
  if (!agent) {
    throw new Error("还没有选择执行 Agent，请先在偏好设置的 AI 页选择 OpenCode 或 Claude Code");
  }

  const result = await runAgentTask({
    agent,
    task: options.task,
    document: "",
    files: options.files.map((file) => ({ ...file, text: normalizeLineEndings(file.text) })),
    project: agentContext(options.settings, options.project),
    onStage: options.onStage,
  });

  const after = (result.files ?? []).map((file) => ({
    path: file.path,
    // CLI 可能按平台写回 CRLF；统一成 LF，diff 与写回都不再混换行。
    text: normalizeLineEndings(file.text),
  }));
  const changed = after.filter((file) => {
    const before = normalizeLineEndings(
      options.files.find((input) => input.path === file.path)?.text ?? "",
    );
    return file.text !== before;
  });

  return {
    ok: result.ok,
    message: result.message,
    changed,
    error: result.error,
  };
}
