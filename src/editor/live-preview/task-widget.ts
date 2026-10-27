import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";

/** 任务列表的方框，点一下就在 [ ] / [x] 之间切换（与 Typora 一致）。 */
export class TaskWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    private readonly from: number,
    private readonly to: number,
    private readonly view: EditorView,
  ) {
    super();
  }

  eq(other: TaskWidget): boolean {
    return other.checked === this.checked && other.from === this.from && other.to === this.to;
  }

  toDOM(): HTMLElement {
    const box = document.createElement("span");
    box.className = this.checked ? "cm-md-task is-checked" : "cm-md-task";
    box.textContent = this.checked ? "☑" : "☐";
    box.setAttribute("role", "checkbox");
    box.setAttribute("aria-checked", String(this.checked));
    box.title = this.checked ? "标记为未完成" : "标记为完成";
    box.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.view.dispatch({
        changes: { from: this.from, to: this.to, insert: this.checked ? "[ ]" : "[x]" },
      });
      this.view.focus();
    });
    return box;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
