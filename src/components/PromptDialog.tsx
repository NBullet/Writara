import { useEffect, useRef, useState } from "react";

/**
 * 应用内文本输入框。
 *
 * **不要用 `window.prompt`**：Electron 没有实现它，调用会直接抛
 * `prompt() is not supported.` —— 打包版里「新建文件 / 重命名 / 插入表格」
 * 三条流程都会静默失败（见 docs/editing-bugs.md 的 A/B 分类记录）。
 * `alert` / `confirm` 在 Electron 里是可用的，只有 prompt 不行。
 */

export interface PromptRequest {
  title: string;
  value: string;
  label?: string;
  placeholder?: string;
  hint?: string;
  confirmText?: string;
}

interface Props {
  request: PromptRequest | null;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptDialog({ request, onSubmit, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      setValue(request.value);
      dialog.showModal();
      // 不用 rAF：窗口被遮挡时 Chromium 会暂停它（见 AGENTS.md 的浮层定位约定）
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 0);
    }
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={ref}
      className="wr-dialog wr-prompt"
      aria-label={request?.title ?? "输入"}
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
            const text = value.trim();
            if (text) onSubmit(text);
          }}
        >
          <h2>{request.title}</h2>
          <label className="wr-prompt-field">
            {request.label ? <span>{request.label}</span> : null}
            <input
              ref={inputRef}
              value={value}
              placeholder={request.placeholder}
              spellCheck={false}
              autoComplete="off"
              onChange={(event) => setValue(event.target.value)}
            />
          </label>
          {request.hint ? <p className="wr-hint">{request.hint}</p> : null}
          <div className="wr-dialog-actions">
            <button type="button" className="wr-button" onClick={onCancel}>
              取消
            </button>
            <button type="submit" className="wr-button wr-button-primary" disabled={!value.trim()}>
              {request.confirmText ?? "确定"}
            </button>
          </div>
        </form>
      ) : null}
    </dialog>
  );
}
