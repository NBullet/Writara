/**
 * 从当前页面读取主题变量，供导出与打印使用。
 *
 * 主题的唯一来源是 CSS 变量（tokens.css + themes.css），这里只做取值，
 * 不再维护第二份调色板，避免两边漂移。
 */

const VARIABLES = [
  "--wr-bg",
  "--wr-surface",
  "--wr-text",
  "--wr-muted",
  "--wr-border",
  "--wr-accent",
  "--wr-link",
  "--wr-selection",
  "--wr-code-bg",
  "--wr-mark-bg",
  "--wr-font-prose",
  "--wr-font-heading",
  "--wr-font-ui",
  "--wr-font-mono",
  "--wr-font-size",
  "--wr-measure",
  // 排版基准（tokens.css）：导出 HTML 直接用同一套刻度
  "--wr-lh",
  "--wr-h1",
  "--wr-h2",
  "--wr-h3",
  "--wr-h4",
  "--wr-h5",
  "--wr-h6",
  "--wr-heading-lh",
  "--wr-heading-ratio",
  "--wr-code-size",
  "--wr-list-indent",
] as const;

export function themeVariables(root: HTMLElement = document.documentElement): Array<[string, string]> {
  if (typeof getComputedStyle === "undefined") return [];
  const computed = getComputedStyle(root);
  const result: Array<[string, string]> = [];

  for (const name of VARIABLES) {
    const value = computed.getPropertyValue(name).trim();
    if (value) result.push([name, value]);
  }

  return result;
}

/** 生成内联到导出 HTML 的 :root 变量块。 */
export function themeCss(root: HTMLElement = document.documentElement): string {
  const variables = themeVariables(root);
  if (variables.length === 0) return "";
  const lines = variables.map(([name, value]) => `  ${name}: ${value};`).join("\n");
  return `:root {\n${lines}\n}`;
}

function parseColor(value: string): [number, number, number] | null {
  const text = value.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits = hex[1]!;
    if (digits.length === 3) {
      const [r, g, b] = digits.split("").map((part) => Number.parseInt(part + part, 16));
      return [r ?? 0, g ?? 0, b ?? 0];
    }
    return [
      Number.parseInt(digits.slice(0, 2), 16),
      Number.parseInt(digits.slice(2, 4), 16),
      Number.parseInt(digits.slice(4, 6), 16),
    ];
  }

  const rgb = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(text);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];

  return null;
}

/** 0（黑）到 1（白）。 */
export function relativeLuminance(color: string): number {
  const parsed = parseColor(color);
  if (!parsed) return 1;
  const [r, g, b] = parsed;
  const value = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return Math.round(Math.min(1, Math.max(0, value)) * 1e6) / 1e6;
}

/** 深色主题（Night 或跟随系统的暗色）需要给 Mermaid 与导出外壳换配色。 */
export function isDarkPalette(root: HTMLElement = document.documentElement): boolean {
  if (typeof getComputedStyle === "undefined") return false;
  const background = getComputedStyle(root).getPropertyValue("--wr-bg").trim();
  return relativeLuminance(background) < 0.45;
}
