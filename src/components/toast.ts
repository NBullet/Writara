export type ToastTone = "success" | "info" | "error";

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
  duration: number;
}

type Listener = () => void;

let current: ToastItem | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let sequence = 0;
const listeners = new Set<Listener>();

function emit(item: ToastItem | null): void {
  current = item;
  for (const listener of listeners) listener();
}

export function subscribeToast(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToast(): ToastItem | null {
  return current;
}

export function dismissToast(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  emit(null);
}

export interface ToastInput {
  message: string;
  tone?: ToastTone;
  action?: ToastAction;
  /** 0 表示不自动消失；默认成功 4s、错误常驻。 */
  duration?: number;
}

/** 外壳里同时只存在一条提示：新的顶掉旧的，避免右边堆成通知中心。 */
export function showToast(input: ToastInput): number {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const tone = input.tone ?? "info";
  const duration = input.duration ?? (tone === "error" ? 0 : 4000);
  const item: ToastItem = {
    id: (sequence += 1),
    message: input.message,
    tone,
    action: input.action,
    duration,
  };
  emit(item);
  if (duration > 0) {
    timer = setTimeout(() => {
      timer = null;
      emit(null);
    }, duration);
  }
  return item.id;
}

export const toast = {
  success(message: string, action?: ToastAction): number {
    return showToast({ message, tone: "success", action });
  },
  info(message: string, action?: ToastAction): number {
    return showToast({ message, tone: "info", action });
  },
  error(message: string, action?: ToastAction): number {
    return showToast({ message, tone: "error", action });
  },
  undo(message: string, action: ToastAction): number {
    return showToast({ message, tone: "info", action, duration: 8000 });
  },
};
