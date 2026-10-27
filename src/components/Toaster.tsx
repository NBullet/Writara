import { useEffect, useState, useSyncExternalStore } from "react";

import { CloseIcon } from "./icons";
import { dismissToast, getToast, subscribeToast, type ToastItem } from "./toast";

/** 固定右下角、一次只显示一条。放在 App 根节点，不参与正文布局。 */
export function Toaster() {
  const item = useSyncExternalStore(subscribeToast, getToast, () => null);
  const [shown, setShown] = useState<ToastItem | null>(item);
  const [leaving, setLeaving] = useState(false);

  // 关闭时保留 140ms 播退场动画；新提示在这期间到达则直接替换。
  useEffect(() => {
    if (item) {
      setShown(item);
      setLeaving(false);
      return;
    }
    if (!shown) return;
    setLeaving(true);
    const timer = setTimeout(() => {
      setShown(null);
      setLeaving(false);
    }, 140);
    return () => clearTimeout(timer);
  }, [item, shown]);

  if (!shown) return null;
  const current = item ?? shown;

  return (
    <div className="wr-toast-stack" aria-live="polite">
      <div
        className={`wr-toast is-${current.tone}${leaving ? " is-leaving" : ""}`}
        role="status"
      >
        <span className="wr-toast-dot" aria-hidden="true" />
        <span className="wr-toast-text">{current.message}</span>
        {current.action ? (
          <button
            type="button"
            className="wr-toast-action"
            onClick={() => {
              dismissToast();
              current.action?.run();
            }}
          >
            {current.action.label}
          </button>
        ) : null}
        <button type="button" className="wr-toast-close" aria-label="关闭提示" onClick={dismissToast}>
          <CloseIcon size={14} />
        </button>
      </div>
    </div>
  );
}
