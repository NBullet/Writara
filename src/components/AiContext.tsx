import { useState } from "react";

import type { Settings } from "../storage/settings";

/**
 * 规则与记忆（对齐 Open Design 的「指令与规则 / 记忆」）。
 *
 * 规则：每次请求都附加的固定指令（文体、禁忌、术语约定），不是会话记忆。
 * 记忆：跨会话复用的事实与偏好；可以在聊天里用「记住：…」直接写入。
 */

interface Props {
  settings: Settings;
  onChange: (settings: Settings) => void;
}

export function AiContext({ settings, onChange }: Props) {
  const [draft, setDraft] = useState("");

  const addMemory = (): void => {
    const text = draft.trim();
    if (!text) return;
    onChange({
      ...settings,
      aiMemory: [
        ...settings.aiMemory,
        { id: `m-${Date.now().toString(36)}`, text: text.slice(0, 500), createdAt: Date.now() },
      ].slice(-100),
    });
    setDraft("");
  };

  return (
    <div className="wr-context">
      <label className="wr-provider-field">
        <span>全局规则（每次请求都会附加）</span>
        <textarea
          rows={5}
          value={settings.aiGlobalRules}
          placeholder={"例如：始终使用中文全角标点；不写「总之 / 综上所述」；技术方案先给结论再论证。"}
          onChange={(event) => onChange({ ...settings, aiGlobalRules: event.target.value })}
        />
      </label>

      <div className="wr-context-memory">
        <div className="wr-context-head">
          <span className="wr-context-title">记忆（{settings.aiMemory.length}）</span>
          <label className="wr-context-switch">
            <input
              type="checkbox"
              checked={settings.aiMemoryEnabled}
              onChange={(event) => onChange({ ...settings, aiMemoryEnabled: event.target.checked })}
            />
            在对话中使用
          </label>
        </div>
        <p className="wr-prefs-note">
          在聊天里以「记住：…」开头即可写入。记忆会附加到 AI 请求；关掉开关只是不再使用，条目不删。
        </p>

        {settings.aiMemory.length ? (
          <ul className="wr-context-list">
            {settings.aiMemory.map((item) => (
              <li key={item.id}>
                <span>{item.text}</span>
                <button
                  type="button"
                  className="wr-provider-remove"
                  onClick={() =>
                    onChange({
                      ...settings,
                      aiMemory: settings.aiMemory.filter((entry) => entry.id !== item.id),
                    })
                  }
                >
                  删除
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="wr-prefs-note">还没有记忆。</p>
        )}

        <div className="wr-context-add">
          <input
            type="text"
            value={draft}
            placeholder="添加一条事实或偏好"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addMemory();
              }
            }}
          />
          <button type="button" className="wr-button" disabled={!draft.trim()} onClick={addMemory}>
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
