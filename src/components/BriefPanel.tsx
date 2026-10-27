import { useEffect } from "react";

import {
  PROFILE_LABELS,
  TONE_LABELS,
  toneForProfile,
  type BriefProfile,
  type BriefTone,
  type WritingBrief,
} from "../ai/brief";

/**
 * 写作任务单面板。
 *
 * 任务单是「精细化」的入口：把读者、篇幅、必须覆盖、禁止项写清楚，
 * 分节初稿才有约束可循。字段故意少而硬，不做项目管理。
 */

export interface BriefPanelProps {
  brief: WritingBrief;
  onChange: (brief: WritingBrief) => void;
  onStart: () => void;
  onClose: () => void;
  /** 文档非空时提示：生成结果会追加或替换（由 App 再确认一次）。 */
  docNonEmpty: boolean;
  busy?: boolean;
}

const PROFILES: BriefProfile[] = ["proposal", "report", "novel", "general"];
const TONES: BriefTone[] = ["formal", "plain", "narrative"];

export function BriefPanel({ brief, onChange, onStart, onClose, docNonEmpty }: BriefPanelProps) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const set = (patch: Partial<WritingBrief>): void => onChange({ ...brief, ...patch });

  return (
    <section className="wr-brief" role="dialog" aria-label="写作任务单">
      <header className="wr-brief-head">
        <span className="wr-brief-title">写作任务单</span>
        <span className="wr-brief-hint">按节生成，结果先审阅再写入</span>
        <button type="button" className="wr-check-close" onClick={onClose} aria-label="关闭任务单">
          ×
        </button>
      </header>

      <div className="wr-brief-body">
        <div className="wr-brief-row">
          <span className="wr-brief-label">档位</span>
          <div className="wr-brief-seg" role="group" aria-label="写作档位">
            {PROFILES.map((profile) => (
              <button
                key={profile}
                type="button"
                className="wr-check-profile"
                aria-pressed={brief.profile === profile}
                onClick={() => set({ profile, tone: toneForProfile(profile) })}
              >
                {PROFILE_LABELS[profile]}
              </button>
            ))}
          </div>
        </div>

        <label className="wr-brief-field">
          <span>主题 / 一句话目标</span>
          <input
            type="text"
            value={brief.topic}
            placeholder="例如：给新同事讲清楚我们为什么写单元测试"
            onChange={(event) => set({ topic: event.target.value })}
          />
        </label>

        <div className="wr-brief-grid">
          <label className="wr-brief-field">
            <span>目标读者</span>
            <input
              type="text"
              value={brief.audience}
              placeholder="技术负责人 / 新同事 / 客户"
              onChange={(event) => set({ audience: event.target.value })}
            />
          </label>
          <label className="wr-brief-field">
            <span>篇幅</span>
            <input
              type="text"
              value={brief.length}
              placeholder="3000 字 / 8 页"
              onChange={(event) => set({ length: event.target.value })}
            />
          </label>
          <label className="wr-brief-field">
            <span>语气</span>
            <select value={brief.tone} onChange={(event) => set({ tone: event.target.value as BriefTone })}>
              {TONES.map((tone) => (
                <option key={tone} value={tone}>
                  {TONE_LABELS[tone]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="wr-brief-field">
          <span>必须覆盖（一行一条）</span>
          <textarea
            rows={4}
            value={brief.mustInclude}
            placeholder={"为什么写测试\n测试替身怎么选\n团队落地步骤"}
            onChange={(event) => set({ mustInclude: event.target.value })}
          />
        </label>

        <label className="wr-brief-field">
          <span>明确避免（一行一条）</span>
          <textarea
            rows={3}
            value={brief.avoid}
            placeholder={"不要 emoji\n不要「总之」式收尾\n不要引用未经验证的数据"}
            onChange={(event) => set({ avoid: event.target.value })}
          />
        </label>

        {docNonEmpty ? (
          <p className="wr-brief-note">当前文档已有内容：生成前会询问追加还是替换。</p>
        ) : null}
      </div>

      <footer className="wr-brief-foot">
        <button
          type="button"
          className="wr-ai-btn primary"
          disabled={!brief.topic.trim()}
          onClick={onStart}
        >
          开始生成
        </button>
        <button type="button" className="wr-ai-btn" onClick={onClose}>
          取消
        </button>
      </footer>
    </section>
  );
}
