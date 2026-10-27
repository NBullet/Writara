import { useEffect, useRef, useState } from "react";

import type { WorkspaceFile } from "../platform/types";
import {
  PROJECT_KINDS,
  createManifest,
  type ProjectKind,
  type ProjectManifest,
  type ProjectOrder,
} from "../project/manifest";
import { projectDocuments } from "../project/order";

/**
 * 项目设置。
 *
 * 只编辑清单里「人需要改」的部分：名称、类型、正文顺序、导出默认值。
 * 资料登记与 exclude 仍由清单手改（低频，且需要看到相对路径）。
 * 保存由 App 写盘，这里不认识 `.writara/` 的路径。
 */

export interface ProjectSettingsRequest {
  /** 当前清单；没有清单（只有指令文件）时传 null，按默认值补一份。 */
  manifest: ProjectManifest | null;
  /** 预填名称（文件夹名 / 当前标题）。 */
  title: string;
  /** 根目录的指令文件，写进新清单的 instructions。 */
  guide: string | null;
}

interface Props {
  request: ProjectSettingsRequest | null;
  files: WorkspaceFile[];
  onSubmit: (manifest: ProjectManifest) => void;
  onCancel: () => void;
}

export function ProjectSettings({ request, files, onSubmit, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  /** 只在打开瞬间取一次文件列表；扫描刷新不能把用户正在编辑的排序冲掉。 */
  const filesRef = useRef(files);
  filesRef.current = files;
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("general");
  const [description, setDescription] = useState("");
  const [order, setOrder] = useState<ProjectOrder>("natural");
  const [spine, setSpine] = useState<string[]>([]);
  const [toc, setToc] = useState(false);
  const [chapterBreak, setChapterBreak] = useState(true);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      const base = request.manifest ?? createManifest(request.title, "general");
      setTitle(base.title);
      setKind(base.kind);
      setDescription(base.description);
      setOrder(base.order);
      setSpine(
        base.spine.length
          ? [...base.spine]
          : projectDocuments(filesRef.current, base).map((file) => file.path),
      );
      setToc(base.export.toc);
      setChapterBreak(base.export.chapterBreak);
      dialog.showModal();
    }
    if (!request && dialog.open) dialog.close();
  }, [request]);

  const documents = projectDocuments(files, request?.manifest ?? null);
  const byPath = new Map(documents.map((file) => [file.path, file]));
  const listed = new Set(spine);
  const unlisted = documents.filter((file) => !listed.has(file.path));

  const move = (index: number, delta: number) => {
    setSpine((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      const [entry] = next.splice(index, 1);
      if (!entry) return current;
      next.splice(target, 0, entry);
      return next;
    });
  };

  const submit = () => {
    const name = title.trim();
    if (!name) return;
    const base = request?.manifest ?? createManifest(name, kind);
    onSubmit({
      ...base,
      title: name,
      kind,
      description: description.trim(),
      order,
      spine,
      instructions: base.instructions || request?.guide || "",
      export: { toc, chapterBreak },
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="wr-dialog wr-project-settings"
      aria-label="项目设置"
      onCancel={(event) => {
        event.preventDefault();
        onCancel();
      }}
    >
      {request ? (
        <form
          className="wr-settings"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <h2>项目设置</h2>
          <p className="wr-hint">清单只描述顺序与导出默认值，正文仍然是普通 Markdown 文件。</p>

          <label className="wr-prompt-field">
            <span>项目名称</span>
            <input
              value={title}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <label className="wr-prompt-field">
            <span>一句话说明</span>
            <input
              value={description}
              spellCheck={false}
              placeholder="可选，用于项目概览"
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          <div className="wr-project-kind">
            <span className="wr-project-kind-label">类型</span>
            <div className="wr-segmented" role="radiogroup" aria-label="项目类型">
              {PROJECT_KINDS.map((entry) => {
                const active = kind === entry.value;
                return (
                  <label key={entry.value} className={active ? "is-active" : undefined}>
                    <input
                      type="radio"
                      name="project-settings-kind"
                      checked={active}
                      onChange={() => setKind(entry.value)}
                    />
                    {entry.label}
                  </label>
                );
              })}
            </div>
          </div>

          <div className="wr-project-order">
            <span className="wr-project-kind-label">正文顺序</span>
            <div className="wr-segmented" role="radiogroup" aria-label="正文顺序">
              {(
                [
                  { value: "natural", label: "自然序" },
                  { value: "custom", label: "自定义序" },
                ] as Array<{ value: ProjectOrder; label: string }>
              ).map((entry) => {
                const active = order === entry.value;
                return (
                  <label key={entry.value} className={active ? "is-active" : undefined}>
                    <input
                      type="radio"
                      name="project-settings-order"
                      checked={active}
                      onChange={() => setOrder(entry.value)}
                    />
                    {entry.label}
                  </label>
                );
              })}
            </div>
            <p className="wr-hint">
              {order === "natural"
                ? "按文件路径排序；导出与项目大纲都使用这个顺序。"
                : "按下面的列表导出；未加入的正文不会进项目导出。"}
            </p>
          </div>

          <div className={order === "custom" ? "wr-spine" : "wr-spine is-disabled"}>
            <div className="wr-spine-col">
              <span className="wr-spine-title">导出顺序</span>
              {spine.length === 0 ? (
                <p className="wr-hint">还没有正文。新建 .md 后再回来排序。</p>
              ) : (
                <ol className="wr-spine-list">
                  {spine.map((path, index) => {
                    const file = byPath.get(path);
                    return (
                      <li key={path}>
                        <span className={file ? "wr-spine-name" : "wr-spine-name is-missing"}>
                          {file ? file.path : `${path}（文件已不存在）`}
                        </span>
                        <span className="wr-spine-actions">
                          <button
                            type="button"
                            title="上移"
                            aria-label={`上移 ${path}`}
                            disabled={order !== "custom" || index === 0}
                            onClick={() => move(index, -1)}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            title="下移"
                            aria-label={`下移 ${path}`}
                            disabled={order !== "custom" || index === spine.length - 1}
                            onClick={() => move(index, 1)}
                          >
                            ↓
                          </button>
                          <button
                            type="button"
                            title="移出导出"
                            aria-label={`移出 ${path}`}
                            disabled={order !== "custom"}
                            onClick={() => setSpine((current) => current.filter((entry) => entry !== path))}
                          >
                            ✕
                          </button>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>

            <div className="wr-spine-col">
              <span className="wr-spine-title">未加入</span>
              {unlisted.length === 0 ? (
                <p className="wr-hint">所有正文都在导出顺序里。</p>
              ) : (
                <ul className="wr-spine-list">
                  {unlisted.map((file) => (
                    <li key={file.path}>
                      <span className="wr-spine-name">{file.path}</span>
                      <button
                        type="button"
                        title="加入导出"
                        aria-label={`加入 ${file.path}`}
                        disabled={order !== "custom"}
                        onClick={() => setSpine((current) => [...current, file.path])}
                      >
                        ＋
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          <div className="wr-project-export">
            <span className="wr-project-kind-label">项目导出</span>
            <label className="wr-project-guide">
              <input type="checkbox" checked={toc} onChange={(event) => setToc(event.target.checked)} />
              <span>生成目录页</span>
            </label>
            <label className="wr-project-guide">
              <input
                type="checkbox"
                checked={chapterBreak}
                onChange={(event) => setChapterBreak(event.target.checked)}
              />
              <span>每章另起一页</span>
            </label>
          </div>

          <div className="wr-dialog-actions">
            <button type="button" className="wr-button" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="wr-button wr-button-primary" disabled={!title.trim()}>
              保存
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
