import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 设计基准守卫：外壳 UI 不写死色值。
 *
 * tokens.css（变量本体）、themes.css（主题覆盖）是色值的**唯一合法来源**；
 * 打印/导出链路在无主题环境运行，有自己的回退值（AGENTS.md 既有约定）。
 * 其余 UI 代码的颜色一律引用 `--wr-*` 变量——变量派生走 var()/color-mix()，
 * 所以比较前先把 var(...) 整块剥掉，`var(--wr-link, #2f6f8f)` 这类回退不会误报。
 */

/** 允许出现字面色值的文件（相对 src 的路径，统一 / 分隔）。 */
const ALLOWED = new Set([
  "styles/tokens.css",
  "styles/themes.css",
  "styles/print-shell.css",
  "export/printStyles.ts",
  "export/print.ts",
  "export/png.ts",
  // Mermaid 可能在拿不到 CSS 变量的环境里渲染（独立 HTML / 隐藏打印窗口），
  // themeVariables 需要一组明暗兜底色；能取到 --wr-* 时以变量为准。
  "export/mermaid.ts",
  // canvas 栅格化要给透明 PNG 铺白底（Word 的纸是白的），这是数据不是 UI 颜色
  "export/svg-raster.ts",
  "export/theme-vars.test.ts",
  "export/print.test.ts",
  "settings/theme-preview.ts",
  "sample.ts",
]);

const STYLE_ROOT = resolve(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      walk(full, out);
    } else if (/\.(ts|tsx|css)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

/** 去掉注释与 var()，让字面色检查只针对真正的硬编码。 */
function stripInert(source: string, isCss: boolean): string {
  let text = source.replace(/\/\*[\s\S]*?\*\//g, " ");
  if (!isCss) {
    text = text.replace(/^\s*\/\/.*$/gm, " ");
  }
  // var( 的参数里不允许再嵌 var(，去掉一层即可
  for (let i = 0; i < 3 && /var\(/.test(text); i += 1) {
    text = text.replace(/var\([^()]*\)/g, " ");
  }
  return text;
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(/g;

describe("外壳样式只引用 token", () => {
  it("src 下没有白名单之外的硬编码颜色", () => {
    const violations: string[] = [];
    for (const file of walk(STYLE_ROOT)) {
      const rel = relative(STYLE_ROOT, file).split(sep).join("/");
      if (ALLOWED.has(rel) || rel.endsWith(".d.ts")) continue;
      const isCss = rel.endsWith(".css");
      const source = stripInert(readFileSync(file, "utf8"), isCss);
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        const matches = line.match(COLOR);
        if (matches) {
          violations.push(`${rel}:${index + 1} → ${line.trim().slice(0, 80)}`);
        }
      });
    }
    expect(violations, violations.join("\n")).toEqual([]);
  });
});
