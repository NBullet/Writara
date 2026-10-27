export interface ConfirmAction {
  id: string;
  label: string;
  /** 破坏性动作用红色描边，不要和主按钮抢。 */
  tone?: "default" | "danger";
  primary?: boolean;
}

export interface ConfirmRequest {
  title: string;
  message?: string;
  actions: ConfirmAction[];
  cancelLabel?: string;
}

type Handler = (request: ConfirmRequest) => Promise<string | null>;

let handler: Handler | null = null;

/** App 挂载时注册；返回注销函数，避免 StrictMode 双挂载后留下旧处理器。 */
export function registerConfirm(next: Handler): () => void {
  handler = next;
  return () => {
    if (handler === next) handler = null;
  };
}

/**
 * 应用内确认框。没有挂载处理器时按「取消」处理——绝不退回 window.confirm，
 * 否则 Electron 里又会弹出原生模态。
 */
export function askConfirm(request: ConfirmRequest): Promise<string | null> {
  if (!handler) return Promise.resolve(null);
  return handler(request);
}
