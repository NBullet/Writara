import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

/**
 * 选区浮条：选中一段文字后浮出「AI 改写」动作条。
 *
 * 与图片浮条同一套手法：ViewPlugin 建 DOM 挂在编辑器根节点、`position: fixed`、
 * 定位推迟到更新周期之外（setTimeout，不是 rAF——窗口被遮挡时 rAF 会整帧暂停）。
 *
 * 浮条只负责出动作：点击经 CustomEvent 冒泡到 document，由 App 的 AI 钩子接管
 * （AI 调用、流式与 diff 审阅都是 React 层的事，插件不订阅状态）。
 * 动作里带当前选区范围，防「点了按钮选区已经变了」的竞态。
 */

export const AI_ACTION_EVENT = "writara:ai-action-selection";

export interface AiActionEventDetail {
  action: string;
  from: number;
  to: number;
}

/** 想直接从编辑器外触发同一动作（菜单 / 命令面板）时也用同一事件。 */
export function dispatchAiAction(
  view: EditorView,
  action: string,
  range?: { from: number; to: number },
): void {
  const selection = view.state.selection.main;
  const final = range ?? { from: selection.from, to: selection.to };
  view.dom.dispatchEvent(
    new CustomEvent(AI_ACTION_EVENT, {
      detail: {
        action,
        from: Math.min(final.from, final.to),
        to: Math.max(final.from, final.to),
      },
      // 要能冒泡到 window：App 的 AI 钩子监听的是 document 级事件
      bubbles: true,
    }),
  );
}

const BUTTONS: Array<{ action: string; label: string; title: string }> = [
  { action: "polish", label: "润色", title: "AI 润色选中文字" },
  { action: "expand", label: "扩写", title: "AI 扩写选中文字" },
  { action: "shorten", label: "缩写", title: "AI 缩写选中文字" },
  { action: "deslop", label: "去 AI 腔", title: "AI 重写，去掉机器腔" },
  { action: "table", label: "表格", title: "AI 把选中内容整理成表格" },
  { action: "chart", label: "图表", title: "AI 把选中内容画成 Mermaid 图" },
];

export function aiSelectionToolbar(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly bar: HTMLDivElement;
      private shown = false;
      private frame = 0;

      constructor(private readonly view: EditorView) {
        this.bar = document.createElement("div");
        this.bar.className = "cm-md-ai-bar";
        this.bar.style.display = "none";

        const label = document.createElement("span");
        label.className = "cm-md-it-label";
        label.textContent = "AI";
        this.bar.appendChild(label);

        for (const button of BUTTONS) {
          const el = document.createElement("button");
          el.type = "button";
          el.className = "cm-md-tb";
          el.textContent = button.label;
          el.title = button.title;
          el.dataset.action = button.action;
          this.bar.appendChild(el);
        }

        // 不抢编辑器焦点：既保住选区，也不触发源码回退
        this.bar.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        this.bar.addEventListener("click", (event) => {
          const target = (event.target as HTMLElement | null)?.closest("button");
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          const action = target.dataset.action;
          if (!action) return;
          dispatchAiAction(this.view, action);
        });

        view.dom.appendChild(this.bar);
        view.scrollDOM.addEventListener("scroll", this.schedule, { passive: true });
        window.addEventListener("resize", this.schedule);
        this.refresh(view.state);
      }

      private schedule = (): void => {
        if (this.frame) return;
        this.frame = window.setTimeout(() => {
          this.frame = 0;
          this.place();
        }, 0);
      };

      private refresh(state: EditorView["state"]): void {
        const selection = state.selection.main;
        this.shown = selection.from !== selection.to && !this.view.composing;
        if (!this.shown) {
          this.bar.style.display = "none";
          return;
        }
        this.schedule();
      }

      private place(): void {
        if (!this.shown) {
          this.bar.style.display = "none";
          return;
        }
        try {
          const head = this.view.coordsAtPos(this.view.state.selection.main.from);
          if (!head) {
            this.bar.style.display = "none";
            return;
          }
          const box = this.bar.style.display === "flex" ? this.bar.getBoundingClientRect() : null;
          const width = box?.width || 300;
          const height = box?.height || 28;
          const maxLeft = Math.max(8, window.innerWidth - width - 8);
          const left = Math.min(Math.max(8, head.left), maxLeft);
          const top = head.top - height - 6 >= 8 ? head.top - height - 6 : head.bottom + 6;
          this.bar.style.display = "flex";
          this.bar.style.left = `${left}px`;
          this.bar.style.top = `${top}px`;
        } catch (error) {
          // 测试环境（jsdom）没有真实布局（Range 缺 getClientRects）：
          // 坐标拿不到就不显示，静默跳过；真实浏览器里不该发生
          if (!(error instanceof TypeError)) throw error;
          this.bar.style.display = "none";
        }
      }

      update(update: ViewUpdate): void {
        if (
          !update.selectionSet &&
          !update.docChanged &&
          !update.viewportChanged &&
          !update.geometryChanged
        ) {
          return;
        }
        this.refresh(update.state);
      }

      destroy(): void {
        this.view.scrollDOM.removeEventListener("scroll", this.schedule);
        window.removeEventListener("resize", this.schedule);
        if (this.frame) window.clearTimeout(this.frame);
        this.bar.remove();
      }
    },
  );
}
