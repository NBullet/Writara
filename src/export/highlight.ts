import type { HLJSApi } from "highlight.js";

/**
 * 打印/导出时的代码高亮。
 *
 * 用 highlight.js 而不是 CodeMirror 的解析器：导出发生在后台，拿不到编辑器视图，
 * 只需要「一段代码 → 带 class 的 HTML」。按需动态加载，不拖慢首屏。
 */

type HighlightModule = { default: HLJSApi };

let loader: Promise<HighlightModule> | null = null;

function loadHighlight(): Promise<HighlightModule> {
  // 用完整构建：common 只覆盖 37 种语言，和编辑器的 90+ 语言对不上。
  loader ??= import("highlight.js") as Promise<HighlightModule>;
  return loader;
}

export async function highlightCodeBlocks(html: string): Promise<string> {
  if (!/<code class="language-[^"]+"/.test(html)) return html;

  let hljs: HLJSApi;
  try {
    hljs = (await loadHighlight()).default;
  } catch {
    return html; // 拿不到高亮库就保持单色，不影响导出
  }

  const template = document.createElement("template");
  template.innerHTML = html;

  for (const code of Array.from(template.content.querySelectorAll("pre > code"))) {
    const language = (code.className.match(/language-([\w-]+)/)?.[1] ?? "").toLowerCase();
    const resolved = language === "asm" ? "x86asm" : language;
    if (!resolved || !hljs.getLanguage(resolved)) continue;
    const source = code.textContent ?? "";
    try {
      code.innerHTML = hljs.highlight(source, { language: resolved, ignoreIllegals: true }).value;
    } catch {
      // 单个代码块失败就保留原文
    }
  }

  return template.innerHTML;
}
