import { useEffect } from "react";

import type { CheckGroup, CheckIssue, CheckProfile, CheckSeverity } from "../ai/checks";

/**
 * 文档体检面板。
 *
 * 右侧浮层而不是居中对话框：体检要「看一条、跳一次、改一处」，
 * 遮住正文会打断这个循环。跳转不关面板，用户可以一路看下去。
 */

export interface CheckReport {
  docName: string;
  profile: CheckProfile;
  issues: CheckIssue[];
}

export interface CheckReportProps {
  report: CheckReport | null;
  onClose: () => void;
  onJump: (issue: CheckIssue) => void;
  onFixAll: () => void;
  onRerun: () => void;
  onCopy: () => void;
  onProfileChange: (profile: CheckProfile) => void;
}

const GROUPS: Array<{ id: CheckGroup; label: string }> = [
  { id: "structure", label: "结构" },
  { id: "language", label: "语言" },
  { id: "links", label: "链接" },
  { id: "form", label: "形式" },
  { id: "style", label: "风格" },
  { id: "novel", label: "长篇" },
];

const SEVERITY_LABELS: Record<CheckSeverity, string> = {
  error: "错误",
  warn: "警告",
  info: "提示",
};

const PROFILES: Array<{ id: CheckProfile; label: string }> = [
  { id: "general", label: "通用" },
  { id: "proposal", label: "方案" },
  { id: "novel", label: "小说" },
];

export function CheckReportPanel({
  report,
  onClose,
  onJump,
  onFixAll,
  onRerun,
  onCopy,
  onProfileChange,
}: CheckReportProps) {
  useEffect(() => {
    if (!report) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [report, onClose]);

  if (!report) return null;

  const counts: Record<CheckSeverity, number> = { error: 0, warn: 0, info: 0 };
  for (const issue of report.issues) counts[issue.severity] += 1;
  const fixable = report.issues.some((issue) => issue.fix);

  return (
    <section className="wr-check" role="dialog" aria-label="文档体检">
      <header className="wr-check-head">
        <span className="wr-check-title">文档体检</span>
        <span className="wr-check-doc">{report.docName}</span>
        <button type="button" className="wr-check-close" onClick={onClose} aria-label="关闭体检">
          ×
        </button>
      </header>

      <div className="wr-check-toolbar">
        <span className="wr-check-counts">
          {(["error", "warn", "info"] as CheckSeverity[]).map((severity) => (
            <span className={`wr-check-count is-${severity}`} key={severity}>
              {SEVERITY_LABELS[severity]} {counts[severity]}
            </span>
          ))}
        </span>
        <span className="wr-check-profiles" role="group" aria-label="体检档位">
          {PROFILES.map((profile) => (
            <button
              key={profile.id}
              type="button"
              className="wr-check-profile"
              aria-pressed={report.profile === profile.id}
              onClick={() => onProfileChange(profile.id)}
            >
              {profile.label}
            </button>
          ))}
        </span>
      </div>

      <div className="wr-check-list">
        {report.issues.length === 0 ? (
          <p className="wr-check-empty">没有发现问题。</p>
        ) : (
          GROUPS.map((group) => {
            const items = report.issues.filter((issue) => issue.group === group.id);
            if (!items.length) return null;
            return (
              <section className="wr-check-group" key={group.id}>
                <h3 className="wr-check-group-title">
                  {group.label}
                  <span>{items.length}</span>
                </h3>
                {items.map((issue, index) => (
                  <button
                    key={`${issue.rule}-${issue.from ?? "na"}-${index}`}
                    type="button"
                    className={`wr-check-item is-${issue.severity}`}
                    disabled={issue.from === null}
                    title={issue.from === null ? "全篇统计项，无法定位" : "跳到这一处"}
                    onClick={() => onJump(issue)}
                  >
                    <span className="wr-check-dot" aria-hidden="true" />
                    <span className="wr-check-text">{issue.message}</span>
                    <span className="wr-check-line">
                      {issue.line === null ? "" : `第 ${issue.line} 行`}
                    </span>
                  </button>
                ))}
              </section>
            );
          })
        )}
      </div>

      <footer className="wr-check-foot">
        {fixable ? (
          <button type="button" className="wr-ai-btn primary" onClick={onFixAll}>
            修复可自动处理的
          </button>
        ) : null}
        <button type="button" className="wr-ai-btn" onClick={onRerun}>
          重新检查
        </button>
        <button type="button" className="wr-ai-btn" onClick={onCopy}>
          复制报告
        </button>
        <button type="button" className="wr-ai-btn" onClick={onClose}>
          关闭
        </button>
      </footer>
    </section>
  );
}
