/**
 * 主题卡片的纸面缩略图数据。
 *
 * 这里**故意**把颜色抄了一份：主题变量挂在 `:root[data-style]` 上，
 * 嵌套一个 `[data-style]` 的 div 拿不到那组变量（选择器不匹配），
 * 卡片就只能在渲染时内联色值。改主题色时记得同步这里（consistency 之外的人工约定）。
 */

export interface ThemePreview {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  border: string;
  accent: string;
  /** 标题字体类型：卡片里只表现「衬线 / 无衬线 / 等宽」的差异。 */
  heading: "serif" | "sans" | "mono";
  dark: boolean;
}

export const THEME_PREVIEWS: Record<string, ThemePreview> = {
  writara: {
    bg: "#ffffff",
    surface: "#f7f5f0",
    text: "#26221d",
    muted: "#8a8175",
    border: "#e2ddd2",
    accent: "#b4472e",
    heading: "serif",
    dark: false,
  },
  github: {
    bg: "#ffffff",
    surface: "#f6f8fa",
    text: "#24292f",
    muted: "#57606a",
    border: "#d0d7de",
    accent: "#0969da",
    heading: "sans",
    dark: false,
  },
  newsprint: {
    bg: "#fbfaf6",
    surface: "#f4f1ea",
    text: "#1c1b18",
    muted: "#6f6a5f",
    border: "#ddd8cb",
    accent: "#8b1e1e",
    heading: "serif",
    dark: false,
  },
  night: {
    bg: "#1e1e1e",
    surface: "#252526",
    text: "#d4d4d4",
    muted: "#8d8d8d",
    border: "#3c3c3c",
    accent: "#4ec9b0",
    heading: "mono",
    dark: true,
  },
  pixyll: {
    bg: "#ffffff",
    surface: "#fafafa",
    text: "#333333",
    muted: "#777777",
    border: "#e5e5e5",
    accent: "#0076df",
    heading: "serif",
    dark: false,
  },
  whitey: {
    bg: "#ffffff",
    surface: "#ffffff",
    text: "#000000",
    muted: "#808080",
    border: "#eeeeee",
    accent: "#000000",
    heading: "sans",
    dark: false,
  },
};

const HEADING_FONT: Record<ThemePreview["heading"], string> = {
  serif: '"Iowan Old Style", "Source Han Serif SC", "Noto Serif SC", Georgia, serif',
  sans: '"Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
  mono: '"Cascadia Code", Consolas, monospace',
};

export function previewHeadingFont(preview: ThemePreview): string {
  return HEADING_FONT[preview.heading];
}

/** 主题不在表里时退回 Writara，卡片至少不空白。 */
export function previewFor(style: string): ThemePreview {
  return THEME_PREVIEWS[style] ?? THEME_PREVIEWS.writara!;
}
