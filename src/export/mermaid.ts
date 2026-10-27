/**
 * Mermaid 图表：打印/导出与编辑器共用同一个渲染入口。
 *
 * 体积大、渲染是异步的，所以按需加载；编辑器里用块级 widget，
 * 打印时替换 ```mermaid 代码块。
 */

interface MermaidApi {
  initialize(config: Record<string, unknown>): void;
  parse(text: string): Promise<unknown>;
  render(id: string, text: string): Promise<{ svg: string }>;
}

type MermaidModule = { default: MermaidApi };

let loader: Promise<MermaidModule> | null = null;
let counter = 0;

function loadMermaid(): Promise<MermaidModule> {
  loader ??= import("mermaid") as Promise<MermaidModule>;
  return loader;
}

/** 从当前主题读一个 CSS 变量；读不到时用明/暗两套兜底值。 */
function themeVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * Mermaid 的配色跟随当前主题（六个主题都只覆盖 --wr-*）。
 * 不要写死 neutral / dark：那会让图表在暖色纸面上变成灰紫方块。
 */
function mermaidTheme(dark: boolean): Record<string, string> {
  const background = themeVar("--wr-bg", dark ? "#1e1e1e" : "#ffffff");
  return {
    background,
    primaryColor: themeVar("--wr-code-bg", dark ? "#2d2d2d" : "#f2efe7"),
    primaryTextColor: themeVar("--wr-text", dark ? "#d4d4d4" : "#26221d"),
    primaryBorderColor: themeVar("--wr-border", dark ? "#3c3c3c" : "#e2ddd2"),
    lineColor: themeVar("--wr-muted", dark ? "#8d8d8d" : "#8a8175"),
    secondaryColor: themeVar("--wr-surface", background),
    tertiaryColor: background,
    fontFamily: themeVar("--wr-font-prose", "system-ui, sans-serif"),
    fontSize: "14px",
  };
}

/** 渲染成 SVG 字符串；失败返回 null（调用方决定显示源码还是占位）。 */
export async function renderMermaidSvg(source: string, dark: boolean): Promise<string | null> {
  let mermaid: MermaidApi;
  try {
    mermaid = (await loadMermaid()).default;
    mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      themeVariables: mermaidTheme(dark),
      securityLevel: "strict",
      fontFamily: "inherit",
      // 语法错误时不要在 body 里插一张巨大的错误图，那会把整个页面撑坏
      suppressErrorRendering: true,
    });
  } catch {
    return null;
  }

  // 先 parse：语法错误时直接返回，不进入 render，也不产生任何 DOM 副作用
  try {
    await mermaid.parse(source);
  } catch {
    return null;
  }

  const id = `wr-mermaid-${Date.now()}-${(counter += 1)}`;
  try {
    const { svg } = await mermaid.render(id, source);
    return svg;
  } catch {
    cleanupMermaid(id);
    return null;
  }
}

/** mermaid 失败时可能残留临时节点，清掉。 */
function cleanupMermaid(id: string): void {
  for (const target of [id, `d${id}`]) {
    document.getElementById(target)?.remove();
  }
}

export async function renderMermaidBlocks(html: string, dark = false): Promise<string> {
  if (!/language-mermaid/.test(html)) return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const code of Array.from(template.content.querySelectorAll("pre > code"))) {
    if (!code.classList.contains("language-mermaid")) continue;
    const source = code.textContent ?? "";
    if (!source.trim()) continue;

    const svg = await renderMermaidSvg(source, dark);
    if (!svg) continue; // 语法错误时保留代码块，让用户能改

    const figure = document.createElement("div");
    figure.className = "wr-mermaid";
    figure.innerHTML = svg;
    code.closest("pre")?.replaceWith(figure);
  }

  return template.innerHTML;
}
