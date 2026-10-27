import { WidgetType } from "@codemirror/view";

/**
 * 表情短代码的渲染结果（`:smile:` → 😄）。
 *
 * 打印/导出会把短代码换成 emoji 字符，编辑器里也必须换，
 * 否则同一句话在屏幕上还是 `:smile:`、纸面上却是笑脸。
 * 光标触到这个 emoji 时退回源码（由 analyze 的 spanTouched 判断，按节点而不是按行）。
 */
export class EmojiWidget extends WidgetType {
  constructor(readonly char: string) {
    super();
  }

  eq(other: EmojiWidget): boolean {
    return other.char === this.char;
  }

  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "cm-md-emoji";
    span.textContent = this.char;
    // 语义上仍是原文的短代码，读屏不要念出图形
    span.setAttribute("aria-label", this.char);
    return span;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
