import { Prec, type EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * 「块内编辑态」的公共部分：怎么退出、怎么搭预览面板。
 * 公式块与图表块共用（语义见 docs/focus-views.md §5.2）。
 */

export interface EditableBlock {
  from: number;
  to: number;
}

export type BlockFinder = (state: EditorState, pos: number) => EditableBlock | null;

/**
 * 把光标移到块外。
 *
 * 块末尾如果就是文档末尾，需要一个真正「块外」的位置：补一个换行。
 * 否则光标仍停在闭合围栏那一行，块继续处于编辑态，✓ 看起来像没反应。
 */
export function exitBlock(view: EditorView, blockTo: number): void {
  const { doc } = view.state;
  const end = Math.min(Math.max(blockTo, 0), doc.length);

  if (end >= doc.length) {
    view.dispatch({
      changes: { from: doc.length, insert: "\n" },
      selection: { anchor: doc.length + 1 },
      effects: EditorView.scrollIntoView(doc.length + 1, { y: "nearest" }),
    });
  } else {
    const anchor = Math.min(doc.lineAt(end).to + 1, doc.length);
    view.dispatch({
      selection: { anchor },
      effects: EditorView.scrollIntoView(anchor, { y: "nearest" }),
    });
  }
  view.focus();
}

/**
 * Mod-Enter / Escape：光标在可编辑块里时退出编辑态。
 * 不在块里时返回 false，把键让给别的处理器（查找栏、对话框）。
 */
export function blockEditingKeys(find: BlockFinder): Extension {
  const exit = (view: EditorView): boolean => {
    const block = find(view.state, view.state.selection.main.head);
    if (!block) return false;
    exitBlock(view, block.to);
    return true;
  };

  return Prec.high(
    keymap.of([
      { key: "Mod-Enter", run: exit },
      { key: "Escape", run: exit },
    ]),
  );
}

export interface PreviewPanel {
  host: HTMLElement;
  frame: HTMLElement;
  body: HTMLElement;
  status: HTMLElement;
  done: HTMLButtonElement;
}

/**
 * 编辑态下方的预览面板：标题 / 状态 / ✓ 完成 + 内容区。
 *
 * 纵向间距只用 padding：块级 widget 的高度要能被 CodeMirror 正确测量，
 * margin 不计入 offsetHeight（见 AGENTS.md「不要用 margin」）。
 */
export function createPreviewPanel(
  label: string,
  view: EditorView,
  blockTo: number,
): PreviewPanel {
  const host = document.createElement("div");
  host.className = "cm-md-block-preview";
  host.dataset.blockTo = String(blockTo);

  const frame = document.createElement("div");
  frame.className = "cm-md-preview-frame";

  const head = document.createElement("div");
  head.className = "cm-md-preview-head";

  const name = document.createElement("span");
  name.className = "cm-md-preview-label";
  name.textContent = label;

  const status = document.createElement("span");
  status.className = "cm-md-preview-status";

  const done = document.createElement("button");
  done.type = "button";
  done.className = "cm-md-preview-done";
  done.textContent = "✓ 完成";
  done.title = "结束编辑（Ctrl/Cmd + Enter）";
  done.addEventListener("mousedown", (event) => {
    event.preventDefault();
    event.stopPropagation();
  });
  done.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    // 位置可能随编辑变化，一律从 DOM 上取最新值
    exitBlock(view, Number(host.dataset.blockTo ?? "0"));
  });

  head.append(name, status, done);

  const body = document.createElement("div");
  body.className = "cm-md-preview-body";

  frame.append(head, body);
  host.append(frame);
  return { host, frame, body, status, done };
}
