/**
 * 平台层的唯一入口。
 *
 * Web 版默认用浏览器实现；Electron 启动时在渲染进程最早的位置
 * 调用 `setPlatform(createDesktopFs())`（M1）。
 */

import { createBrowserFs } from "./browser";
import type { PlatformFs } from "./types";

let current: PlatformFs = createBrowserFs();

export function platform(): PlatformFs {
  return current;
}

export function isDesktop(): boolean {
  return current.kind === "desktop";
}

/** 仅供启动/测试替换实现；运行时不要中途切换。 */
export function setPlatform(next: PlatformFs): void {
  current = next;
}

export type {
  ChooseFolderOptions,
  DocRef,
  OpenedFile,
  PlatformFs,
  SaveOutcome,
  SaveRequest,
  WorkspaceFile,
  WorkspaceRoot,
} from "./types";
