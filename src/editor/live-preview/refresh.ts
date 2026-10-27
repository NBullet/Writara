import { StateEffect } from "@codemirror/state";

/**
 * 让预览类 widget 重建（主题切换、图片解析器更换）。
 * 单独放一个模块：modes.ts 与 live-preview 都需要它，避免循环依赖。
 */
export const refreshPreviewEffect = StateEffect.define<null>();
