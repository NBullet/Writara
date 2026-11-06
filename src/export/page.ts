/** 打印纸张与页边距。浏览器只接受 CSS 能表达的部分；页码/页眉页脚属于打印对话框。 */

/**
 * 版面预设：
 * - `a4` / `a4-landscape`：固定方向的 A4；
 * - `auto`：自适应——屏幕纸面铺满可用宽度，打印时按内容在纵向 / 横向里挑一个；
 * - `letter`：Letter 纵向。
 */
export type PaperSize = "a4" | "a4-landscape" | "auto" | "letter";
export type MarginPreset = "normal" | "narrow" | "wide";
export type PageOrientation = "portrait" | "landscape";

export interface PageSettings {
  paper: PaperSize;
  margin: MarginPreset;
  /** 自适应版面按内容判定出的方向；只有 `paper === "auto"` 时生效。 */
  orientation?: PageOrientation;
}

export interface ResolvedPage {
  /** 实际使用的版面（非法值已经回落到 a4）。 */
  paper: PaperSize;
  /** 实际印出来的方向；自适应已经解析成具体方向。 */
  orientation: PageOrientation;
  /** 给 @page 用的纸张名。 */
  size: string;
  /** 上、右、下、左（mm）。 */
  margins: [number, number, number, number];
  /** 纸张宽高（mm）。 */
  paperWidthMm: number;
  paperHeightMm: number;
  /** 正文可用高度（mm），用于打印前的分页测量。 */
  contentHeightMm: number;
  /** 正文可用宽度（mm）。 */
  contentWidthMm: number;
  /** 屏幕纸面宽度（mm）；`null` 表示自适应，铺满可用宽度。 */
  sheetWidthMm: number | null;
  css: string;
}

const PAPER = {
  a4: { size: "A4", width: 210, height: 297 },
  "a4-landscape": { size: "A4 landscape", width: 297, height: 210 },
  letter: { size: "Letter", width: 215.9, height: 279.4 },
} as const;

export const PAPER_OPTIONS: Array<{ value: PaperSize; label: string }> = [
  { value: "a4", label: "A4 纵向" },
  { value: "a4-landscape", label: "A4 横向" },
  { value: "auto", label: "自适应" },
  { value: "letter", label: "Letter" },
];

export function paperLabel(paper: PaperSize): string {
  return PAPER_OPTIONS.find((option) => option.value === paper)?.label ?? "A4 纵向";
}

const MARGINS: Record<MarginPreset, [number, number, number, number]> = {
  // 常规的左右边距取 16mm：A4 剩下 178mm ≈ 672px，正好等于编辑器默认栏宽（42rem）。
  // 这样「默认设置下」纸面和屏幕的栏宽、字号完全相同，换行位置也一致。
  normal: [20, 16, 22, 16],
  narrow: [12, 12, 14, 12],
  wide: [30, 26, 32, 26],
};

/**
 * A4 横向的上下页边距单独收紧：横向纸只有 210mm 高，
 * 20/22mm 的纵向边距会把可用高度压到 168mm，多行表格很容易多出一页。
 * 左右边距仍按「常规」的 16mm，正文宽保持 265mm。
 */
const LANDSCAPE_MARGINS: [number, number, number, number] = [10, 16, 12, 16];

export const PX_PER_MM = 96 / 25.4;

/** `rem` 以浏览器默认根字号 16px 计。 */
export const REM_PX = 16;

function paperOf(paper: unknown): PaperSize {
  return paper === "letter" || paper === "a4-landscape" || paper === "auto" ? paper : "a4";
}

export function resolvePage(settings: PageSettings): ResolvedPage {
  const paper = paperOf(settings.paper);
  const selected = MARGINS[settings.margin] ?? MARGINS.normal;

  const auto = paper === "auto";
  const orientation: PageOrientation = auto
    ? settings.orientation === "landscape"
      ? "landscape"
      : "portrait"
    : paper === "a4-landscape"
      ? "landscape"
      : "portrait";
  const margins =
    orientation === "landscape" && settings.margin === "normal" ? LANDSCAPE_MARGINS : selected;
  const [top, right, bottom, left] = margins;

  // 自适应先按内容判定出的方向取一张真实 A4，导出与测量都需要确定的宽高。
  const key: "a4" | "a4-landscape" | "letter" = auto
    ? orientation === "landscape"
      ? "a4-landscape"
      : "a4"
    : paper;
  const size = PAPER[key];

  return {
    paper,
    orientation,
    size: size.size,
    margins,
    paperWidthMm: size.width,
    paperHeightMm: size.height,
    contentHeightMm: Math.max(50, size.height - top - bottom),
    contentWidthMm: Math.max(50, size.width - left - right),
    sheetWidthMm: auto ? null : size.width,
    css: `@page { size: ${size.size}; margin: ${top}mm ${right}mm ${bottom}mm ${left}mm; }`,
  };
}

/**
 * 编辑器里的「纸」与打印预览页共用这一组变量。
 * 固定版面按纸张宽度铺纸（栏宽比纸还宽时跟着变宽）；自适应直接铺满可用宽度。
 */
export function applyPagePreview(settings: PageSettings, root: HTMLElement): void {
  const page = resolvePage(settings);
  root.style.setProperty("--wr-page-pad", `${page.margins[3]}mm`);
  root.style.setProperty("--wr-page-pad-top", `${page.margins[0]}mm`);
  root.style.setProperty("--wr-page-pad-bottom", `${page.margins[2]}mm`);
  root.style.setProperty(
    "--wr-page-width",
    page.sheetWidthMm === null
      ? "100%"
      : `max(${page.sheetWidthMm}mm, calc(var(--wr-measure) + 2 * var(--wr-page-pad)))`,
  );
  // 自适应要「尽可能用完」宽度：纸铺满，正文列也铺满（只留左右页边距）。
  // A4 横向同理：纸变宽了，正文列也跟着纸宽走，否则右边会空一大块。
  // 纵向 / Letter 仍按用户设置的栏宽居中。
  const fill = page.sheetWidthMm === null || page.orientation === "landscape";
  root.style.setProperty(
    "--wr-content-measure",
    fill
      ? page.sheetWidthMm === null
        ? "calc(100% - 2 * var(--wr-page-pad))"
        : "calc(min(100%, var(--wr-page-width)) - 2 * var(--wr-page-pad))"
      : "var(--wr-measure)",
  );
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
  // 自适应与 A4 横向都用整张纸的正文宽：屏幕上的正文列已经跟着纸宽走了，
  // 纸上也要一致，否则横向版面在 PDF 里又会缩回栏宽。
  const fill = page.paper === "auto" || page.orientation === "landscape";
  const columnPx = fill ? contentPx : Math.min(contentPx, measurePx);
  const fontPx = fontSize;
  const css = `.wr-doc {\n  --wr-font-size: ${fontPx}px;\n  max-width: ${columnPx.toFixed(1)}px;\n  margin: 0 auto;\n  font-size: ${fontPx}px;\n}`;
  return { columnPx, fontPx, css };
}
