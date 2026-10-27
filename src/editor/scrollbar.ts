import type { Extension } from "@codemirror/state";
import { ViewPlugin, type EditorView, type ViewUpdate } from "@codemirror/view";

/**
 * 自绘滚动条。
 *
 * 原生滚动条的长度完全由 `scrollHeight / clientHeight` 决定。本编辑器是虚拟滚动，
 * 屏幕外的高度先估算、渲染到才校正，于是滚动时总高度一直在变，滑块长度就跟着抖。
 *
 * 这里把原生滚动条藏掉，自己画一个「指示器」：
 * - 滚动过程中**冻结**滑块长度（用开始滚动时的总高度），只在停手后才重算；
 * - 重算时按方向锚定边缘：向上滚固定上边缘、只改下边缘，向下滚固定下边缘；
 * - 另外原生滚动条一消失，正文宽度也不再跳（配合 scrollbar-gutter 甚至不需要）。
 *
 * 滚动本身仍然由 `.cm-scroller` 完成，键盘、滚动到光标、拖选都不受影响。
 */

const IDLE_MS = 160;
const MIN_THUMB = 28;

export function smoothScrollbar(): Extension {
  return ViewPlugin.fromClass(
    class {
      private readonly scroller: HTMLElement;
      private readonly track: HTMLDivElement;
      private readonly thumb: HTMLDivElement;
      private total: number;
      private timer: number | null = null;
      private lastScrollTop = 0;
      private direction: "up" | "down" = "down";
      private lastTop = 0;
      private lastHeight = 0;
      private dragging = false;
      private dragStartY = 0;
      private dragStartScroll = 0;

      constructor(view: EditorView) {
        this.scroller = view.scrollDOM;
        this.track = document.createElement("div");
        this.track.className = "cm-scrollbar-track";
        this.thumb = document.createElement("div");
        this.thumb.className = "cm-scrollbar-thumb";
        this.track.appendChild(this.thumb);
        view.dom.appendChild(this.track);

        this.total = this.scroller.scrollHeight;
        this.scroller.addEventListener("scroll", this.onScroll, { passive: true });
        this.thumb.addEventListener("pointerdown", this.onThumbDown);
        this.thumb.addEventListener("pointermove", this.onThumbMove);
        this.thumb.addEventListener("pointerup", this.onThumbUp);
        this.thumb.addEventListener("pointercancel", this.onThumbUp);
        this.track.addEventListener("pointerdown", this.onTrackDown);
        this.track.addEventListener("wheel", this.onWheel, { passive: false });

        this.render();
      }

      update(update: ViewUpdate): void {
        // 文档或视口尺寸变化时，若当前不在滚动，直接按真实高度重算。
        if (!update.docChanged && !update.geometryChanged) return;
        if (this.timer !== null) return;
        this.total = this.scroller.scrollHeight;
        this.render();
      }

      destroy(): void {
        this.scroller.removeEventListener("scroll", this.onScroll);
        this.thumb.removeEventListener("pointerdown", this.onThumbDown);
        this.thumb.removeEventListener("pointermove", this.onThumbMove);
        this.thumb.removeEventListener("pointerup", this.onThumbUp);
        this.thumb.removeEventListener("pointercancel", this.onThumbUp);
        this.track.removeEventListener("pointerdown", this.onTrackDown);
        this.track.removeEventListener("wheel", this.onWheel);
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.track.remove();
      }

      private onScroll = (): void => {
        const top = this.scroller.scrollTop;
        this.direction = top < this.lastScrollTop ? "up" : "down";
        this.lastScrollTop = top;

        // 滚动期间只移动，不改长度：total 保持开始滚动时的值。
        this.render();
        if (this.timer !== null) window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
          this.timer = null;
          const real = this.scroller.scrollHeight;
          if (Math.abs(real - this.total) < 1) return;
          this.total = real;
          // 向上滚固定上边缘，向下滚固定下边缘。
          this.render(this.direction === "up" ? "top" : "bottom");
        }, IDLE_MS);
      };

      private onThumbDown = (event: PointerEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        this.dragging = true;
        this.dragStartY = event.clientY;
        this.dragStartScroll = this.scroller.scrollTop;
        this.thumb.setPointerCapture(event.pointerId);
      };

      private onThumbMove = (event: PointerEvent): void => {
        if (!this.dragging) return;
        const { track, thumb, maxScroll } = this.metrics();
        const travel = Math.max(1, track - thumb);
        this.scroller.scrollTop = this.dragStartScroll + ((event.clientY - this.dragStartY) * maxScroll) / travel;
      };

      private onThumbUp = (event: PointerEvent): void => {
        this.dragging = false;
        if (this.thumb.hasPointerCapture(event.pointerId)) {
          this.thumb.releasePointerCapture(event.pointerId);
        }
      };

      private onTrackDown = (event: PointerEvent): void => {
        if (event.target === this.thumb) return;
        event.preventDefault();
        const rect = this.track.getBoundingClientRect();
        const { track, thumb, maxScroll } = this.metrics();
        const travel = Math.max(1, track - thumb);
        const y = event.clientY - rect.top - thumb / 2;
        this.scroller.scrollTop = Math.max(0, Math.min(maxScroll, (y * maxScroll) / travel));
      };

      private onWheel = (event: WheelEvent): void => {
        event.preventDefault();
        this.scroller.scrollTop += event.deltaY;
      };

      private metrics(): { track: number; thumb: number; maxScroll: number } {
        const track = this.scroller.clientHeight;
        const total = Math.max(this.total, track);
        const thumb = Math.max(MIN_THUMB, Math.min(track, (track * track) / total));
        const maxScroll = Math.max(1, this.scroller.scrollHeight - track);
        return { track, thumb, maxScroll };
      }

      private render(anchor?: "top" | "bottom"): void {
        const { track, thumb, maxScroll } = this.metrics();
        if (this.scroller.scrollHeight <= track + 1) {
          this.track.classList.add("is-hidden");
          return;
        }
        this.track.classList.remove("is-hidden");

        let top = (this.scroller.scrollTop / maxScroll) * (track - thumb);
        if (anchor) {
          top = anchor === "top" ? this.lastTop : this.lastTop + this.lastHeight - thumb;
        }
        top = Math.max(0, Math.min(track - thumb, top));

        this.lastTop = top;
        this.lastHeight = thumb;
        this.thumb.style.height = `${thumb}px`;
        this.thumb.style.transform = `translateY(${top}px)`;
      }
    },
  );
}
