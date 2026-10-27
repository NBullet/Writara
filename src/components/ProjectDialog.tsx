import { useEffect, useRef, useState } from "react";

import { PROJECT_KINDS, type ProjectKind } from "../project/manifest";

/**
 * 新建 / 转为项目。
 *
 * 只负责收集名称、类型与「是否补 WRITARA.md 骨架」；清单怎么写由
 * `src/project/file.ts` 决定，这里不认识 `.writara/` 的路径。
 */

export interface ProjectDialogRequest {
  mode: "create" | "convert";
  /** 预填名称（通常是文件夹名）。 */
  title: string;
  /** 桌面端才有绝对路径；用来确认选中的是哪个文件夹。 */
  path?: string | null;
}

export interface ProjectDraft {
  title: string;
  kind: ProjectKind;
  guide: boolean;
}

interface Props {
  request: ProjectDialogRequest | null;
  onSubmit: (draft: ProjectDraft) => void;
  onCancel: () => void;
}

export function ProjectDialog({ request, onSubmit, onCancel }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<ProjectKind>("general");
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      setTitle(request.title);
      setKind("general");
      setGuide(false);
      dialog.showModal();
      // 不用 rAF：窗口被遮挡时 Chromium 会暂停它（与 PromptDialog 同一个原因）。
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      className="wr-dialog wr-prompt"
      aria-label={request?.mode === "convert" ? "转为项目" : "新建项目"}
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
            const name = title.trim();
            if (name) onSubmit({ title: name, kind, guide });
          }}
        >
          <h2>{request.mode === "convert" ? "转为项目" : "新建项目"}</h2>
          {request.path ? <p className="wr-hint">{request.path}</p> : null}

          <label className="wr-prompt-field">
            <span>项目名称</span>
            <input
              ref={inputRef}
              value={title}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setTitle(event.target.value)}
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
                      name="project-kind"
                      checked={active}
                      onChange={() => setKind(entry.value)}
                    />
                    {entry.label}
                  </label>
                );
              })}
            </div>
          </div>

          <label className="wr-project-guide">
            <input type="checkbox" checked={guide} onChange={(event) => setGuide(event.target.checked)} />
            <span>同时生成 WRITARA.md 骨架（已存在则不覆盖）</span>
          </label>

          <p className="wr-hint">
            清单写在 .writara/project.json，正文与文件夹结构都不动。
          </p>

          <div className="wr-dialog-actions">
            <button type="button" className="wr-button" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="wr-button wr-button-primary" disabled={!title.trim()}>
              {request.mode === "convert" ? "转为项目" : "创建项目"}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
