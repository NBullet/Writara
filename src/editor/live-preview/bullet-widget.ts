import { WidgetType } from "@codemirror/view";

/**
 * 无序列表的项目符号。
 *
 * 源码里的 `-` / `*` / `+` 在预览态显示成圆点，和打印、导出 HTML 的列表保持一致，
 * 否则「编辑器里是横杠、PDF 里是圆点」，同一篇文档两副样子。
 * 层级决定符号：• ◦ ▪ —— 打印样式里 `ul` / `ul ul` / `ul ul ul` 用的是同一组字符。
 * 光标进入该项所在行时退回源码（列表符号是块级标记，由 analyze 的 linesTouched 判断）。
 */
export const BULLETS = ["•", "◦", "▪"];

export class BulletWidget extends WidgetType {
  constructor(readonly depth = 0) {
    super();
  }

  eq(other: BulletWidget): boolean {
    return other.depth === this.depth;
  }

  toDOM(): HTMLElement {
    const dot = document.createElement("span");
    dot.className = "cm-md-bullet";
    dot.textContent = BULLETS[Math.min(this.depth, BULLETS.length - 1)] ?? BULLETS[0]!;
    dot.setAttribute("aria-hidden", "true");
    return dot;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
