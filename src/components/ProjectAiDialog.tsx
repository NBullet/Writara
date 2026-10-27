import { useEffect, useMemo, useRef, useState } from "react";

import { collapseDiff, diffLines } from "../ai/diff";

/**
 * 项目 AI 任务：一次改多个文件，逐文件 diff 审阅。
 *
 * 与单文档审阅同一条底线：agent 只在临时副本里工作，结果先落在这里，
 * 用户勾选并确认后才写回真实文件。默认全选，但每个文件都能单独放弃。
 */

export interface ProjectAiCandidate {
  path: string;
  title: string;
}

export interface ProjectAiChange {
  path: string;
  before: string;
  after: string;
}

export interface ProjectAiRequest {
  title: string;
  files: ProjectAiCandidate[];
}

interface Props {
  request: ProjectAiRequest | null;
  run: (task: string, paths: string[]) => Promise<{ message: string; changes: ProjectAiChange[] }>;
  apply: (changes: ProjectAiChange[]) => Promise<void>;
  onClose: () => void;
}

export function ProjectAiDialog({ request, run, apply, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [task, setTask] = useState("");
  const [included, setIncluded] = useState<Set<string>>(() => new Set());
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [changes, setChanges] = useState<ProjectAiChange[]>([]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [active, setActive] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      setTask("");
      setIncluded(new Set(request.files.map((file) => file.path)));
      setRunning(false);
      setError(null);
      setMessage("");
      setChanges([]);
      setSelected(new Set());
      setActive("");
      dialog.showModal();
    }
    if (!request && dialog.open) dialog.close();
  }, [request]);

  const diffs = useMemo(() => {
    const table = new Map<string, ReturnType<typeof collapseDiff>>();
    for (const change of changes) table.set(change.path, collapseDiff(diffLines(change.before, change.after)));
    return table;
  }, [changes]);

  const activeChange = changes.find((change) => change.path === active) ?? changes[0];
  const activeDiff = activeChange ? diffs.get(activeChange.path) ?? [] : [];

  const execute = async () => {
    if (!request || !task.trim() || running) return;
    const paths = request.files.filter((file) => included.has(file.path)).map((file) => file.path);
    if (!paths.length) {
      setError("至少选择一个文件");
      return;
    }
    setRunning(true);
    setError(null);
    setMessage("");
    setChanges([]);
    try {
      const result = await run(task.trim(), paths);
      setMessage(result.message);
      setChanges(result.changes);
      setSelected(new Set(result.changes.map((change) => change.path)));
      setActive(result.changes[0]?.path ?? "");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "运行失败");
    } finally {
      setRunning(false);
    }
  };

  const adopt = async () => {
    const picked = changes.filter((change) => selected.has(change.path));
    if (!picked.length) return;
    await apply(picked);
    onClose();
  };

  const toggle = (set: Set<string>, value: string): Set<string> => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  };

  return (
    <dialog
      ref={dialogRef}
      className="wr-dialog wr-project-ai"
      aria-label="项目 AI 任务"
      onCancel={(event) => {
        event.preventDefault();
        if (!running) onClose();
      }}
    >
      {request ? (
        <div className="wr-settings">
          <h2>项目 AI 任务</h2>
          <p className="wr-hint">
            {request.title} · 共 {request.files.length} 篇。改动只进临时副本，确认后才写回。
          </p>

          <label className="wr-prompt-field">
            <span>要做什么</span>
            <textarea
              className="wr-project-ai-task"
              rows={3}
              value={task}
              placeholder="例如：统一各章术语，把「模型」改成「智能体」；或给每章补一段小结。"
              onChange={(event) => setTask(event.target.value)}
            />
          </label>

          {changes.length === 0 ? (
            <div className="wr-project-ai-files">
              <span className="wr-project-kind-label">
                参与改动的文件（{included.size}/{request.files.length}）
              </span>
              <div className="wr-project-ai-list">
                {request.files.map((file) => (
                  <label key={file.path} className="wr-project-ai-item">
                    <input
                      type="checkbox"
                      checked={included.has(file.path)}
                      onChange={() => setIncluded((current) => toggle(current, file.path))}
                    />
                    <span className="wr-project-ai-name">{file.title}</span>
                    <span className="wr-project-ai-path">{file.path}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : null}

          {message && !error ? <p className="wr-hint">{message}</p> : null}
          {error ? <div className="wr-ai-error">{error}</div> : null}

          {changes.length > 0 ? (
            <div className="wr-project-ai-review">
              <div className="wr-project-ai-tabs">
                {changes.map((change) => (
                  <label
                    key={change.path}
                    className={change.path === activeChange?.path ? "is-active" : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(change.path)}
                      onChange={() => setSelected((current) => toggle(current, change.path))}
                    />
                    <button type="button" onClick={() => setActive(change.path)} title={change.path}>
                      {change.path}
                    </button>
                  </label>
                ))}
              </div>
              <div className="wr-ai-diff">
                {activeDiff.map((entry, index) =>
                  entry.kind === "same" ? (
                    <div className="wr-ai-line same" key={index}>
                      {entry.text || " "}
                    </div>
                  ) : entry.kind === "collapse" ? (
                    <div className="wr-ai-collapsed" key={index}>
                      ── 未改动 {entry.count} 行 ──
                    </div>
                  ) : (
                    <div className={`wr-ai-line ${entry.kind}`} key={index}>
                      {entry.text || " "}
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          <div className="wr-dialog-actions">
            <button type="button" className="wr-button" onClick={onClose} disabled={running}>
              {changes.length ? "取消" : "关闭"}
            </button>
            {changes.length ? (
              <button
                type="button"
                className="wr-button wr-button-primary"
                disabled={running || selected.size === 0}
                onClick={() => void adopt()}
              >
                写入所选 {selected.size} 个文件
              </button>
            ) : (
              <button
                type="button"
                className="wr-button wr-button-primary"
                disabled={running || !task.trim()}
                onClick={() => void execute()}
              >
                {running ? "运行中…" : "开始"}
              </button>
            )}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
