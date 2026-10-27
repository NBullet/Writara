import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { findSizedImagesInLine } from "../markdown/image-size";
import { parseImageTarget } from "../markdown/image-target";

/**
 * 图片选中浮条。
 *
 * 光标触到图片（正好是源码露出的时机）时，在图片上方浮出一条工具条：
 * 25% / 50% / 75% / 100% 宽度、原始大小、复制路径。
 *
 * 为什么用 ViewPlugin 而不是 widget：图片一旦聚焦就被换成源码，widget 已经不在 DOM 里；
 * 浮条必须挂在编辑器根节点上（与自绘滚动条同一个做法），`position: fixed` 跟着光标坐标走。
 *
 * 尺寸写的是 Typora 语法 `![alt](src =宽)`。标题与尺寸语法互斥
 * （见 markdown/image-size.ts：URL 里不能有空格），所以**有 title 的图片只给复制路径**，
 * 不为了加尺寸悄悄丢掉标题。
 */

interface ImageTargetInfo {
  from: number;
  to: number;
  alt: string;
  src: string;
  title: string;
  sized: boolean;
}

const SIZE_PRESETS = [25, 50, 75, 100] as const;
const FALLBACK_WIDTH = 600;

function unquote(text: string): string {
  const value = text.trim();
  const first = value[0];
  if ((first === '"' || first === "'") && value.endsWith(first)) return value.slice(1, -1);
  return value;
}

function imageAt(state: EditorState, pos: number): ImageTargetInfo | null {
  const line = state.doc.lineAt(pos);

  // 带尺寸的图片不是合法的 CommonMark 链接目标，语法树里没有 Image 节点，按行扫
  for (const image of findSizedImagesInLine(line.text)) {
    const from = line.from + image.start;
    const to = line.from + image.end;
    if (pos >= from && pos <= to) {
      return {
        from,
        to,
        alt: image.alt,
        src: image.src,
        title: "",
        sized: true,
      };
    }
  }

  for (const side of [1, -1] as const) {
    let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side);
    while (node) {
      if (node.name === "Image" && pos >= node.from && pos <= node.to) {
        const url = node.getChild("URL");
        if (!url) return null;
        const marks = node.getChildren("LinkMark");
        const altFrom = marks[0] ? marks[0].to : node.from;
        const altTo = marks[1] ? marks[1].from : url.from;
        const titleNode = node.getChild("LinkTitle");
        const target = parseImageTarget(state.doc.sliceString(url.from, url.to));
        return {
          from: node.from,
          to: node.to,
          alt: state.doc.sliceString(altFrom, altTo),
          src: target.src,
          title: titleNode ? unquote(state.doc.sliceString(titleNode.from, titleNode.to)) : "",
          sized: target.width !== undefined || target.height !== undefined,
        };
      }
      node = node.parent;
    }
  }
  return null;
}

function imageMarkdown(alt: string, src: string, title: string): string {
  return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
}

export function imageToolbar(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly toolbar: HTMLDivElement;
      private current: ImageTargetInfo | null = null;
      private frame = 0;
      private readonly copyButton: HTMLButtonElement;
      private readonly sizeButtons: HTMLButtonElement[] = [];
      private readonly resetButton: HTMLButtonElement;

      constructor(private readonly view: EditorView) {
        this.toolbar = document.createElement("div");
        this.toolbar.className = "cm-md-image-toolbar";
        this.toolbar.style.display = "none";

        const label = document.createElement("span");
        label.className = "cm-md-it-label";
        label.textContent = "图片";
        this.toolbar.appendChild(label);

        for (const percent of SIZE_PRESETS) {
          const button = this.button(`${percent}%`, `宽度设为正文宽度的 ${percent}%`);
          button.dataset.size = String(percent);
          this.sizeButtons.push(button);
          this.toolbar.appendChild(button);
        }

        this.resetButton = this.button("原始", "去掉尺寸，按原始大小显示");
        this.resetButton.dataset.size = "none";
        this.toolbar.appendChild(this.resetButton);

        const separator = document.createElement("span");
        separator.className = "cm-md-tb-sep";
        this.toolbar.appendChild(separator);

        this.copyButton = this.button("复制路径", "复制图片地址");
        this.copyButton.dataset.action = "copy";
        this.toolbar.appendChild(this.copyButton);

        // 不让浮条抢走编辑器焦点（否则源码会立刻收回去）
        this.toolbar.addEventListener("mousedown", (event) => {
          event.preventDefault();
          event.stopPropagation();
        });
        this.toolbar.addEventListener("click", (event) => {
          const target = (event.target as HTMLElement | null)?.closest("button");
          if (!target) return;
          event.preventDefault();
          event.stopPropagation();
          const size = target.dataset.size;
          if (size) this.applySize(size === "none" ? null : Number(size));
          else if (target.dataset.action === "copy") this.copy();
        });

        view.dom.appendChild(this.toolbar);
        view.scrollDOM.addEventListener("scroll", this.schedule, { passive: true });
        window.addEventListener("resize", this.schedule);

        this.refresh(view.state);
      }

      private button(text: string, title: string): HTMLButtonElement {
        const el = document.createElement("button");
        el.type = "button";
        el.className = "cm-md-tb";
        el.textContent = text;
        el.title = title;
        el.setAttribute("aria-label", title);
        return el;
      }

      /**
       * 定位要放到更新周期之外。
       *
       * 用 setTimeout 而不是 requestAnimationFrame：窗口被遮挡 / 在后台时 rAF 会被
       * Chromium 完全暂停（实测一次都不触发），浮条就永远不出现。超时回调里读布局是安全的。
       */
      private schedule = (): void => {
        if (this.frame) return;
        this.frame = window.setTimeout(() => {
          this.frame = 0;
          this.place();
        }, 0);
      };

      private refresh(state: EditorState): void {
        const info = imageAt(state, state.selection.main.head);
        this.current = info && info.src ? info : null;

        const hasTitle = Boolean(this.current?.title);
        for (const button of this.sizeButtons) {
          button.disabled = !this.current || hasTitle;
        }
        this.resetButton.disabled = !this.current?.sized || hasTitle;
        this.copyButton.disabled = !this.current;

        // 不能在 update() 里读布局：CodeMirror 会抛
        // 「Reading the editor layout isn't allowed during an update」并把这个插件销毁。
        // coordsAtPos / getBoundingClientRect 一律推迟到下一帧。
        if (!this.current) {
          this.toolbar.style.display = "none";
          return;
        }
        this.schedule();
      }

      private place(): void {
        const info = this.current;
        if (!info) {
          this.toolbar.style.display = "none";
          return;
        }
        const coords = this.view.coordsAtPos(info.from);
        if (!coords) {
          this.toolbar.style.display = "none";
          return;
        }

        this.toolbar.style.display = "flex";
        const rect = this.toolbar.getBoundingClientRect();
        const width = rect.width || 280;
        const height = rect.height || 26;
        const maxLeft = Math.max(8, window.innerWidth - width - 8);
        const left = Math.min(Math.max(8, coords.left), maxLeft);
        // 默认在图片上方；顶到视口上沿就翻到下方
        const top = coords.top - height - 6 >= 8 ? coords.top - height - 6 : coords.bottom + 6;
        this.toolbar.style.left = `${left}px`;
        this.toolbar.style.top = `${top}px`;
      }

      private widthFor(percent: number): number {
        const content = this.view.contentDOM.clientWidth || FALLBACK_WIDTH;
        return Math.max(40, Math.round((content * percent) / 100));
      }

      private applySize(percent: number | null): void {
        const info = this.current;
        if (!info) return;
        if (percent !== null && info.title) return;

        const next =
          percent === null
            ? imageMarkdown(info.alt, info.src, info.title)
            : imageMarkdown(info.alt, `${info.src} =${this.widthFor(percent)}`, "");

        if (next === this.view.state.sliceDoc(info.from, info.to)) return;
        this.view.dispatch({
          changes: { from: info.from, to: info.to, insert: next },
          selection: { anchor: info.from + next.length },
        });
        this.view.focus();
      }

      private copy(): void {
        const info = this.current;
        if (!info || !navigator.clipboard) return;
        void navigator.clipboard.writeText(info.src).then(
          () => {
            this.copyButton.textContent = "已复制";
            window.setTimeout(() => {
              this.copyButton.textContent = "复制路径";
            }, 1200);
          },
          () => undefined,
        );
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
        this.toolbar.remove();
      }
    },
  );
}
