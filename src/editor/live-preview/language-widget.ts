import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";

/**
 * 围栏代码块右上角：语言名 + 复制按钮（与 Typora 一致）。
 *
 * 复制的内容在点击时从语法树取，而不是创建 widget 时存一份——
 * 光标离开代码块后 widget 才重建，存快照会复制到旧内容。
 */

function codeAt(view: EditorView, pos: number): string | null {
  let node: SyntaxNode | null = syntaxTree(view.state).resolveInner(pos, 1);
  while (node) {
    if (node.name === "FencedCode" || node.name === "CodeBlock") {
      const text = node.getChild("CodeText");
      return text ? view.state.sliceDoc(text.from, text.to) : null;
    }
    node = node.parent;
  }
  return null;
}

export class LanguageBadgeWidget extends WidgetType {
  constructor(private readonly language: string) {
    super();
  }

  eq(other: LanguageBadgeWidget): boolean {
    return other.language === this.language;
  }

  toDOM(view: EditorView): HTMLElement {
    const badge = document.createElement("span");
    badge.className = "cm-md-lang";

    if (this.language) {
      const label = document.createElement("span");
      label.textContent = this.language;
      badge.appendChild(label);
    }

    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "cm-md-copy";
    copy.textContent = "复制";
    copy.title = "复制代码块";

    copy.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    });

    copy.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const text = codeAt(view, view.posAtDOM(badge));
      if (text === null) return;
      void navigator.clipboard.writeText(text).then(
        () => {
          copy.textContent = "已复制";
          window.setTimeout(() => {
            copy.textContent = "复制";
          }, 1200);
        },
        () => undefined,
      );
    });

    badge.appendChild(copy);
    return badge;
  }

  ignoreEvent(): boolean {
    return true;
  }
}
