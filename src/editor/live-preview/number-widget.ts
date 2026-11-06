import { WidgetType } from "@codemirror/view";

/**
 * 有序列表的数字标记（`1.` / `2.` …）。
 *
 * 源码里的数字保留，只是替换成固定宽度的 span（宽度 = 悬挂缩进）：
 * 这样首行文字与换行后的文字落在同一列，和打印的 `ol` 一致。
 * 光标进入该行时退回源码，数字仍然可以编辑。
 */
export class NumberWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }

  eq(other: NumberWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-number";
    span.textContent = this.text;
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
