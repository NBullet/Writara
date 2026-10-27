import { useEffect, useState } from "react";

import type { DetectedAgentInfo } from "../platform/bridge";
import type { Settings } from "../storage/settings";

/**
 * 执行 Agent 选择（对齐 Open Design 的「你的 CLI」）。
 *
 * 不内置模型提供方：模型、端点、Key 全由 agent 自己的配置决定，
 * Writara 只做检测、选择、记住每个 agent 的模型，以及把模型暴露到对话下方的切换器。
 */

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

const CLI_NAMES: Record<string, string> = {
  opencode: "OpenCode",
  claude: "Claude Code",
  codex: "Codex CLI",
  gemini: "Gemini CLI",
  qwen: "Qwen Code",
  "cursor-agent": "Cursor Agent",
};

export function AiAgents({ settings, onChange }: Props) {
  const bridge = typeof window !== "undefined" ? window.writara?.ai : undefined;
  const [agents, setAgents] = useState<DetectedAgentInfo[]>([]);
  const [scanning, setScanning] = useState(false);
  const [models, setModels] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Record<string, string>>({});

  const scan = async (force: boolean): Promise<void> => {
    if (!bridge) return;
    setScanning(true);
    try {
      setAgents(await bridge.detect(force));
    } catch (cause) {
      setFeedback((current) => ({
        ...current,
        _scan: cause instanceof Error ? cause.message : "扫描失败",
      }));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    void scan(false);
    // 只在挂载时扫一次；「重新扫描」按钮负责刷新
  }, []);

  const active = settings.aiAgentId || "";
  const installed = agents.filter((agent) => agent.available);
  const missing = agents.filter((agent) => !agent.available);

  const select = (id: string): void => onChange({ ...settings, aiAgentId: id });

  const setModel = (agentId: string, model: string): void => {
    onChange({
      ...settings,
      aiAgentModels: { ...settings.aiAgentModels, [agentId]: model },
    });
  };

  const loadModels = async (agentId: string): Promise<void> => {
    if (!bridge) return;
    setBusy(`models:${agentId}`);
    try {
      const list = await bridge.models(agentId);
      setModels((current) => ({ ...current, [agentId]: list }));
      setFeedback((current) => ({
        ...current,
        [agentId]: list.length ? `找到 ${list.length} 个模型，点一下填入` : "CLI 没有提供模型列表，手动填写",
      }));
    } catch (cause) {
      setFeedback((current) => ({
        ...current,
        [agentId]: cause instanceof Error ? cause.message : "拉取模型失败",
      }));
    } finally {
      setBusy(null);
    }
  };

  const test = async (agent: DetectedAgentInfo): Promise<void> => {
    if (!bridge) return;
    setBusy(`test:${agent.id}`);
    try {
      const result = await bridge.run({
        runId: `test-${Date.now().toString(36)}`,
        agentId: agent.id,
        model: settings.aiAgentModels[agent.id] || undefined,
        task: "只回复一句 OK，不要修改任何文件。",
        document: "",
        timeoutMs: 90_000,
      });
      setFeedback((current) => ({
        ...current,
        [agent.id]: result.ok
          ? `可用：${result.message || "OK"}（${Math.round(result.durationMs / 1000)}s）`
          : `失败：${result.error ?? "未知错误"}`,
      }));
    } catch (cause) {
      setFeedback((current) => ({
        ...current,
        [agent.id]: cause instanceof Error ? cause.message : "测试失败",
      }));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="wr-agents">
      <p className="wr-agents-intro">
        选择用来运行提示词的 Agent。模型、端点与 Key 都由 agent 自己负责，本工具只检测本机 CLI
        并记住每个 agent 的模型（模型会出现在对话面板下方的切换器里）。
      </p>

      <div className="wr-agents-head">
        <span className="wr-agents-title">你的 CLI（{installed.length}）</span>
        <button
          type="button"
          className="wr-button"
          disabled={!bridge || scanning}
          onClick={() => void scan(true)}
        >
          {scanning ? "扫描中…" : "重新扫描"}
        </button>
      </div>

      {!bridge ? (
        <p className="wr-prefs-note">本机 CLI 只在桌面端可用。Web 版需要桌面端配合。</p>
      ) : null}

      {installed.length === 0 && bridge ? (
        <p className="wr-prefs-note">
          没有检测到 coding agent CLI。先安装 OpenCode 或 Claude Code，再点「重新扫描」。
        </p>
      ) : null}

      {installed.map((agent) => {
        const id = `cli:${agent.id}`;
        const selected = active === id;
        const model = settings.aiAgentModels[agent.id] ?? "";
        return (
          <section className={selected ? "wr-agent is-active" : "wr-agent"} key={agent.id}>
            <button type="button" className="wr-agent-row" onClick={() => select(id)}>
              <span className="wr-agent-mark">{agent.name.slice(0, 2)}</span>
              <span className="wr-agent-main">
                <span className="wr-agent-name">
                  {agent.name}
                  <span className="wr-agent-tag">已安装</span>
                  {agent.runnable ? null : <span className="wr-agent-tag is-warn">暂不支持运行</span>}
                </span>
                <span className="wr-agent-meta">
                  {agent.version ?? "版本未知"} · {agent.path ?? ""}
                </span>
                <span className="wr-agent-meta">模型 {model || "CLI 默认设置"}</span>
              </span>
              <span className="wr-agent-state">{selected ? "使用中" : "使用"}</span>
            </button>

            {selected ? (
              <div className="wr-agent-detail">
                <label className="wr-provider-field">
                  <span>模型</span>
                  <input
                    type="text"
                    value={model}
                    placeholder={`留空用 CLI 默认${agent.fallbackModels[0] ? `（例如 ${agent.fallbackModels[0]}）` : ""}`}
                    onChange={(event) => setModel(agent.id, event.target.value)}
                  />
                </label>
                <div className="wr-provider-actions">
                  <button
                    type="button"
                    className="wr-button"
                    disabled={busy === `models:${agent.id}`}
                    onClick={() => void loadModels(agent.id)}
                  >
                    {busy === `models:${agent.id}` ? "拉取中…" : "拉取模型"}
                  </button>
                  <button
                    type="button"
                    className="wr-button"
                    disabled={!agent.runnable || busy === `test:${agent.id}`}
                    onClick={() => void test(agent)}
                  >
                    {busy === `test:${agent.id}` ? "测试中…" : "测试（真实调用一次）"}
                  </button>
                </div>
                {models[agent.id]?.length ? (
                  <div className="wr-provider-models">
                    {models[agent.id]!.map((entry) => (
                      <button
                        key={entry}
                        type="button"
                        className="wr-provider-chip"
                        onClick={() => setModel(agent.id, entry)}
                      >
                        {entry}
                      </button>
                    ))}
                  </div>
                ) : null}
                {feedback[agent.id] ? (
                  <p className="wr-provider-feedback">{feedback[agent.id]}</p>
                ) : null}
                {agent.runnable ? null : (
                  <p className="wr-prefs-note">
                    这个 CLI 已检测到，但本版本只支持运行 OpenCode / Claude Code。
                  </p>
                )}
              </div>
            ) : null}
          </section>
        );
      })}

      {missing.length ? (
        <details className="wr-agents-missing">
          <summary>未安装（{missing.length}）</summary>
          <ul>
            {missing.map((agent) => (
              <li key={agent.id}>
                {CLI_NAMES[agent.id] ?? agent.name}
                {agent.runnable ? "" : "（本版本暂不支持运行）"}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {feedback._scan ? <p className="wr-provider-feedback">{feedback._scan}</p> : null}
    </div>
  );
}
