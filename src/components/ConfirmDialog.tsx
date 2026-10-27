import { useEffect, useRef } from "react";

import type { ConfirmRequest } from "./confirm";

interface Props {
  request: ConfirmRequest | null;
  onSettle: (id: string | null) => void;
}

/**
 * 应用内确认框：支持「取消 + 多个动作」，用于保存 / 放弃 / 删除 / 覆盖。
 *
 * 原生 `confirm` 在 Electron 里能用，但会阻塞渲染、样式也不属于这个产品；
 * 统一走这里。Esc 与「取消」都返回 null。
 */
export function ConfirmDialog({ request, onSettle }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) {
      dialog.showModal();
      // 不用 rAF：窗口被遮挡时 Chromium 会暂停它（与 PromptDialog 同一个原因）。
      setTimeout(() => cancelRef.current?.focus(), 0);
    }
    if (!request && dialog.open) dialog.close();
  }, [request]);

  return (
    <dialog
      ref={dialogRef}
      className="wr-dialog wr-confirm"
      aria-labelledby="wr-confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        onSettle(null);
      }}
    >
      {request ? (
        <div className="wr-settings">
          <h2 id="wr-confirm-title">{request.title}</h2>
          {request.message ? <p className="wr-hint">{request.message}</p> : null}
          <div className="wr-dialog-actions">
            <button ref={cancelRef} type="button" className="wr-button" onClick={() => onSettle(null)}>
              {request.cancelLabel ?? "取消"}
            </button>
            {request.actions.map((action) => (
              <button
                key={action.id}
                type="button"
                className={[
                  "wr-button",
                  action.tone === "danger" ? "is-danger" : "",
                  action.primary ? "wr-button-primary" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => onSettle(action.id)}
              >
                {action.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </dialog>
  );
}
