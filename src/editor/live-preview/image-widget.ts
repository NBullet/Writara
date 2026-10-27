import type { EditorView } from "@codemirror/view";
import { WidgetType } from "@codemirror/view";

import { isSafeImageSrc } from "../../markdown/sanitize";
import { withImageWidth } from "../../markdown/image-size";
import { imageResolverGeneration, isRelativeSrc, resolveImage } from "../../io/image-resolver";

/** 拖拽缩放的宽度下限（px）。 */
const MIN_WIDTH = 40;

/** 行内图片。加载失败或协议不允许时退化成带边框的文字，不留空白。 */
export class ImageWidget extends WidgetType {
  private readonly generation = imageResolverGeneration();

  constructor(
    readonly src: string,
    readonly alt: string,
    readonly title: string,
    private readonly width: number | undefined,
    private readonly height: number | undefined,
    private readonly view: EditorView,
    /** 图片节点在文档里的范围：点击它要把光标放进来（否则会落到下一行）。 */
    private readonly from = 0,
    /** 图片节点的结束位置：拖拽缩放据此改写源码。 */
    private readonly to = 0,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return (
      other.src === this.src &&
      other.alt === this.alt &&
      other.title === this.title &&
      other.width === this.width &&
      other.height === this.height &&
      other.generation === this.generation &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  toDOM(): HTMLElement {
    const host = document.createElement("span");
    host.className = "cm-md-image";

    // 图片是行内原子 widget：点它的中间时 posAtCoords 会落到**下一行**，
    // 光标进不了图片、浮条也就出不来。这里自己接管点击，把光标放到节点起点。
    host.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.view.dispatch({ selection: { anchor: this.from } });
      this.view.focus();
    });

    if (!isSafeImageSrc(this.src)) {
      host.classList.add("is-blocked");
      host.textContent = this.alt || "图片";
      host.title = "这个图片地址不被允许";
      return host;
    }

    const image = document.createElement("img");
    image.alt = this.alt;
    if (this.title) image.title = this.title;
    if (this.width) image.width = this.width;
    if (this.height) image.height = this.height;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("load", () => this.view.requestMeasure());
    image.addEventListener("error", () => {
      host.classList.add("is-error");
      host.replaceChildren(document.createTextNode(this.alt || "图片加载失败"));
      this.view.requestMeasure();
    });

    // 相对路径需要工作区解析；没有解析器时给出可读的占位，而不是破图。
    if (isRelativeSrc(this.src)) {
      const pending = resolveImage(this.src);
      if (!pending) {
        host.classList.add("is-missing");
        host.textContent = this.alt || "图片（相对路径）";
        host.title = "没有图片目录：可打开所在文件夹，或用「文件 → 设置图片根目录…」选择";
        return host;
      }

      host.classList.add("is-loading");
      host.appendChild(image);
      this.attachResize(host, image);
      void pending.then((url) => {
        if (!host.isConnected) return;
        host.classList.remove("is-loading");
        if (url) {
          image.src = url;
        } else {
          host.classList.add("is-missing");
          host.replaceChildren(document.createTextNode(this.alt || "图片无法加载"));
        }
        this.view.requestMeasure();
      });
      return host;
    }

    image.src = this.src;
    host.appendChild(image);
    this.attachResize(host, image);
    return host;
  }

  /**
   * 右下角拖拽缩放（写成 Typora 的 `=宽`）。
   *
   * 拖拽期间**只改 DOM 宽度**：每移动一次就 dispatch 会让 widget 重建，
   * 手柄连同监听一起被换掉，拖到一半就断。松手才改写源码。
   * 有 title 的图片不给手柄：尺寸写在链接目标里，与 `"title"` 互斥。
   */
  private attachResize(host: HTMLElement, image: HTMLImageElement): void {
    if (this.to <= this.from || this.title) return;

    const handle = document.createElement("span");
    handle.className = "cm-md-image-resize";
    handle.title = "拖动调整宽度";
    handle.setAttribute("aria-hidden", "true");
    host.appendChild(handle);

    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.button !== 0) return;

      const rect = image.getBoundingClientRect();
      if (rect.width <= 0) return;

      const startX = event.clientX;
      const startWidth = rect.width;
      const limit = Math.max(MIN_WIDTH, this.view.contentDOM.clientWidth - 24);
      let current = Math.round(startWidth);

      host.classList.add("is-resizing");
      image.style.width = `${Math.round(startWidth)}px`;
      image.style.height = "auto";
      image.removeAttribute("height");

      const onMove = (move: MouseEvent): void => {
        const width = Math.max(MIN_WIDTH, Math.min(limit, startWidth + move.clientX - startX));
        current = Math.round(width);
        image.style.width = `${current}px`;
      };

      const finish = (): void => {
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
        host.classList.remove("is-resizing");
      };

      const onUp = (): void => {
        finish();
        const raw = this.view.state.doc.sliceString(this.from, this.to);
        const next = withImageWidth(raw, current);
        if (next === raw) {
          // 没写回源码（比如宽度没变）：把拖拽时的临时样式还原
          image.style.width = "";
          image.style.height = "";
          if (this.width) image.width = this.width;
          if (this.height) image.height = this.height;
          return;
        }
        this.view.dispatch({ changes: { from: this.from, to: this.to, insert: next } });
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    });
  }

  /**
   * 图片不该吃掉点击：交给 CodeMirror 放光标。图片是原子节点，点击只能落在
   * 节点的 from / to 上，所以 spanTouched 把边界也算作「触到」——否则点进去看不到源码。
   */
  ignoreEvent(): boolean {
    return true;
  }
}
