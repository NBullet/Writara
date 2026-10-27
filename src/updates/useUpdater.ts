import { useCallback, useEffect, useRef, useState } from "react";

import { toast } from "../components/toast";
import { isVisibleStatus, type UpdateStatus } from "./types";

/**
 * 在线更新的渲染进程侧。
 *
 * 状态全部由主进程推；这里只负责四件事：对齐晚挂载时的当前状态、
 * 手动检查的反馈（已是最新 / 失败）、横幅的显示与“稍后”、下载 / 安装。
 * Web 版没有 `window.writara.updates`，自动降级成空实现。
 */
export function useUpdater() {
  const [status, setStatus] = useState<UpdateStatus>({ state: "idle" });
  /** 用户点了“稍后”时对应的状态；状态一变就重新出现。 */
  const [dismissed, setDismissed] = useState<string | null>(null);
  const manual = useRef(false);

  useEffect(() => {
    let alive = true;
    const apply = (next: UpdateStatus): void => {
      if (!alive) return;
      setStatus(next);
      if (!manual.current) return;
      if (next.state === "none") {
        toast.success("已是最新版本");
        manual.current = false;
      } else if (next.state === "error") {
        // 静默检查失败不打扰，只有用户主动点的才提示。
        if (next.manual) toast.error(next.message);
        manual.current = false;
      } else if (next.state === "available") {
        manual.current = false;
      }
    };

    const bridge = window.writara?.updates;
    void bridge?.status().then((value) => apply(value));
    const off = bridge?.onStatus((value) => apply(value));
    return () => {
      alive = false;
      off?.();
    };
  }, []);

  const check = useCallback(async () => {
    const bridge = window.writara?.updates;
    if (!bridge) {
      toast.error("桌面端才支持在线更新");
      return;
    }
    manual.current = true;
    setDismissed(null);
    await bridge.check();
  }, []);

  const download = useCallback(() => {
    void window.writara?.updates?.download();
  }, []);

  const install = useCallback(() => {
    void window.writara?.updates?.install();
  }, []);

  const visible = isVisibleStatus(status) && dismissed !== status.state;

  return {
    status,
    visible,
    check,
    download,
    install,
    dismiss: useCallback(() => setDismissed(status.state), [status.state]),
  };
}
