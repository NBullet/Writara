import type { Settings } from "../storage/settings";

/**
 * 本机 agent 的统一调用层。
 *
 * 配置全部来自 agent 自身：这里只负责选中的 agent、模型、上下文与取消。
 * 不存在内置 API 分支 —— 没有 agent 就明确提示用户去设置里选一个。
 */

export interface AgentTarget {
  id: string;
  name: string;
  model: string;
}

const NAMES: Record<string, string> = {
  opencode: "OpenCode",
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  qwen: "Qwen Code",
  "cursor-agent": "Cursor Agent",
};

export function selectedAgent(settings: Settings): AgentTarget | null {
  const raw = settings.aiAgentId || "";
  if (!raw.startsWith("cli:")) return null;
  const id = raw.slice(4);
  return {
    id,
    name: NAMES[id] ?? id,
    model: settings.aiAgentModels[id] ?? "",
  };
}

export interface AgentFile {
  path: string;
  text: string;
}

export interface AgentRunOutput {
  ok: boolean;
  message: string;
  document: string;
  changed: boolean;
  durationMs: number;
  error?: string;
  /** 项目任务：每个文件读取后的内容。 */
  files?: AgentFile[];
}

export interface AgentRunOptions {
  agent: AgentTarget;
  task: string;
  document: string;
  project?: string;
  selection?: string;
  timeoutMs?: number;
  /** 项目任务：一次改多个文件（相对路径 + 内容）。 */
  files?: AgentFile[];
  onStart?: (runId: string) => void;
  onStage?: (stage: string) => void;
}

export async function runAgentTask(options: AgentRunOptions): Promise<AgentRunOutput> {
  const bridge = window.writara?.ai;
  if (!bridge) throw new Error("本机 Agent 只在桌面端可用");
  const runId = `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  options.onStart?.(runId);
  options.onStage?.(`正在运行 ${options.agent.name}${options.agent.model ? ` · ${options.agent.model}` : ""}…`);
  return await bridge.run({
    runId,
    agentId: options.agent.id,
    model: options.agent.model || undefined,
    task: options.task,
    document: options.document,
    project: options.project,
    selection: options.selection,
    timeoutMs: options.timeoutMs ?? 300_000,
    files: options.files,
  });
}

export function cancelAgentRun(runId: string | null): void {
  if (!runId) return;
  void window.writara?.ai.cancel(runId);
}

/** 项目规范 + 全局规则 + 长期记忆，供所有 agent 任务共用。 */
export function agentContext(settings: Settings, project: string): string {
  const parts: string[] = [];
  if (project.trim()) parts.push(`【项目写作规范】\n${project.trim()}`);
  if (settings.aiGlobalRules.trim()) {
    parts.push(`【全局规则】\n${settings.aiGlobalRules.trim()}`);
  }
  if (settings.aiMemoryEnabled && settings.aiMemory.length) {
    parts.push(
      `【长期记忆】\n${settings.aiMemory
        .slice(-20)
        .map((item) => `- ${item.text}`)
        .join("\n")}`,
    );
  }
  return parts.join("\n\n");
}
