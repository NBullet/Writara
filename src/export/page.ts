/** 打印纸张与页边距。浏览器只接受 CSS 能表达的部分；页码/页眉页脚属于打印对话框。 */

export type PaperSize = "a4" | "letter";
export type MarginPreset = "normal" | "narrow" | "wide";

export interface PageSettings {
  paper: PaperSize;
  margin: MarginPreset;
}

export interface ResolvedPage {
  /** 给 @page 用的纸张名。 */
  size: string;
  /** 上、右、下、左（mm）。 */
  margins: [number, number, number, number];
  /** 正文可用高度（mm），用于打印前的分页测量。 */
  contentHeightMm: number;
  /** 正文可用宽度（mm）。 */
  contentWidthMm: number;
  css: string;
}

const PAPER = {
  a4: { size: "A4", height: 297, width: 210 },
  letter: { size: "Letter", height: 279.4, width: 215.9 },
} as const;

const MARGINS: Record<MarginPreset, [number, number, number, number]> = {
  // 常规的左右边距取 16mm：A4 剩下 178mm ≈ 672px，正好等于编辑器默认栏宽（42rem）。
  // 这样「默认设置下」纸面和屏幕的栏宽、字号完全相同，换行位置也一致。
  normal: [20, 16, 22, 16],
  narrow: [12, 12, 14, 12],
  wide: [30, 26, 32, 26],
};

export const PX_PER_MM = 96 / 25.4;

/** `rem` 以浏览器默认根字号 16px 计。 */
export const REM_PX = 16;

export function resolvePage(settings: PageSettings): ResolvedPage {
  const paper = PAPER[settings.paper] ?? PAPER.a4;
  const margins = MARGINS[settings.margin] ?? MARGINS.normal;
  const [top, right, bottom, left] = margins;
  return {
    size: paper.size,
    margins,
    contentHeightMm: Math.max(50, paper.height - top - bottom),
    contentWidthMm: Math.max(50, paper.width - left - right),
    css: `@page { size: ${paper.size}; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }`,
  };
}

export interface DocLayout {
  /** 正文栏宽（px）。 */
  columnPx: number;
  /** 实际字号（px）。 */
  fontPx: number;
  css: string;
}

/**
 * 让打印版面和编辑器**一模一样**：字号原样使用，栏宽取「编辑器栏宽」与「纸张可用宽」的较小值。
 *
 * 早先为了保住换行位置，纸张放不下时会把字号等比缩小；结果字比屏幕上小 2%，
 * 屏幕上看着就跟 PDF 不是一个大小。既然一致性优先，就只缩栏宽、绝不改字号：
 * - 默认设置（42rem + A4 常规 16mm）下纸张可用宽 ≈ 672px，与编辑器完全相等；
 * - 换成宽页边距这类放不下的情况，栏宽变窄、换行位置会变，但字号仍然一致。
 */
export function resolveLayout(page: ResolvedPage, fontSize: number, measureRem: number): DocLayout {
  const contentPx = page.contentWidthMm * PX_PER_MM;
  const measurePx = Math.max(1, measureRem * REM_PX);
  const columnPx = Math.min(contentPx, measurePx);
  const fontPx = fontSize;
  const css = `.wr-doc {\n  --wr-font-size: ${fontPx}px;\n  max-width: ${columnPx.toFixed(1)}px;\n  margin: 0 auto;\n  font-size: ${fontPx}px;\n}`;
  return { columnPx, fontPx, css };
}
