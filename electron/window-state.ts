import { app, screen, type BrowserWindow } from "electron";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";

/**
 * 窗口位置与大小记忆。
 *
 * 换显示器后旧坐标可能落在屏幕外，恢复时要校验：至少有一部分标题栏可见，
 * 否则退回默认尺寸，不然窗口会「打开但看不见」。
 */

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

export const DEFAULT_WINDOW_STATE: WindowState = { width: 1280, height: 860, maximized: false };

function stateFile(): string {
  return path.join(app.getPath("userData"), "window-state.json");
}

function visibleOnSomeDisplay(x: number, y: number, width: number, height: number): boolean {
  return screen.getAllDisplays().some((display) => {
    const area = display.workArea;
    return (
      x + width > area.x + 60 &&
      x < area.x + area.width - 60 &&
      y + height > area.y + 40 &&
      y < area.y + area.height - 40
    );
  });
}

/**
 * 读取窗口状态。
 *
 * 刻意做成同步：文件只有百来字节，而它必须在 `createWindow()` 之前拿到尺寸。
 * 异步读会让「双击 → 出现窗口」多等一个 I/O 往返，冷启动里这是最不该有的等待。
 */
export function loadWindowState(): WindowState {
  let saved: Partial<WindowState>;
  try {
    saved = JSON.parse(readFileSync(stateFile(), "utf8")) as Partial<WindowState>;
  } catch {
    return { ...DEFAULT_WINDOW_STATE };
  }

  if (typeof saved.width !== "number" || typeof saved.height !== "number") {
    return { ...DEFAULT_WINDOW_STATE };
  }

  const size = {
    width: Math.max(760, Math.round(saved.width)),
    height: Math.max(480, Math.round(saved.height)),
    maximized: Boolean(saved.maximized),
  };

  if (typeof saved.x === "number" && typeof saved.y === "number") {
    if (visibleOnSomeDisplay(saved.x, saved.y, size.width, size.height)) {
      return { ...size, x: Math.round(saved.x), y: Math.round(saved.y) };
    }
  }
  return size;
}

export function rememberWindowState(win: BrowserWindow): void {
  let timer: NodeJS.Timeout | null = null;

  const save = (): void => {
    if (win.isDestroyed()) return;
    const bounds = win.getNormalBounds();
    const state: WindowState = {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      maximized: win.isMaximized(),
    };
    void fs
      .mkdir(path.dirname(stateFile()), { recursive: true })
      .then(() => fs.writeFile(stateFile(), JSON.stringify(state), "utf8"))
      .catch(() => undefined);
  };

  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(save, 400);
  };

  win.on("resize", schedule);
  win.on("move", schedule);
  win.on("maximize", schedule);
  win.on("unmaximize", schedule);
  win.on("close", save);
}
