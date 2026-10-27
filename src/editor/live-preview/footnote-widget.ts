import { WidgetType } from "@codemirror/view";

/** 脚注引用：编辑器里显示成上标数字，点一下回到源码。 */
export class FootnoteWidget extends WidgetType {
  constructor(private readonly id: string) {
    super();
  }

  eq(other: FootnoteWidget): boolean {
    return other.id === this.id;
  }

  toDOM(): HTMLElement {
    const sup = document.createElement("sup");
    sup.className = "cm-md-fn";
    sup.textContent = this.id;
    sup.title = `脚注 ${this.id}`;
    return sup;
  }

  ignoreEvent(): boolean {
    return false;
  }
}
