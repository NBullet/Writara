import type { EditorState, Extension } from "@codemirror/state";
import { StateField } from "@codemirror/state";
import type { DecorationSet } from "@codemirror/view";
import { Decoration, EditorView, WidgetType } from "@codemirror/view";

/**
 * 文末留白。
 *
 * 为什么不做成 `.cm-content { padding-bottom }`：CSS 内边距不在 CodeMirror
 * 的高度表里，滚动容器比它算出的内容高度更高，滚到底再动光标就会被校回去
 * （「明明滚下去了又被缩回来」）；直接砍掉又会让最后一行贴着窗口底边，
 * 在文末打字时每一键都要滚动一次。
 *
 * 做成块级 widget 后这段高度是文档的一部分：高度表和滚动容器一致，
 * 光标停在末尾也有余量。`estimatedHeight` 必须和实际高度相同，否则每次
 * 滚动经过都会被校正一次。
 */

const SPACE = 280;

class BottomSpaceWidget extends WidgetType {
  get estimatedHeight(): number {
    return SPACE;
  }

  eq(): boolean {
    return true;
  }

  toDOM(): HTMLElement {
    const host = document.createElement("div");
    host.className = "cm-md-bottom-space";
    host.style.height = `${SPACE}px`;
    return host;
  }

  /** 点击空白区交给 CodeMirror 映射到文末。 */
  ignoreEvent(): boolean {
    return false;
  }
}

function build(state: EditorState): DecorationSet {
  return Decoration.set([
    Decoration.widget({ widget: new BottomSpaceWidget(), block: true, side: 1 }).range(state.doc.length),
  ]);
}

export function bottomSpace(): Extension {
  return StateField.define<DecorationSet>({
    create(state) {
      return build(state);
    },
    update(value, tr) {
      if (!tr.docChanged) return value;
      return build(tr.state);
    },
    provide: (field) => EditorView.decorations.from(field),
  });
}
