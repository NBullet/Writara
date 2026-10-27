import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * 右键菜单。
 *
 * 菜单内容由调用方组装（条目的 `run` 是一个闭包），组件只负责定位、翻转、关闭。
 * 用 portal 挂到 body：侧栏有 `overflow: auto`，直接渲染会被裁掉。
 */

export type ContextEntry =
  | { kind: "separator" }
  | {
      kind: "item";
      label: string;
      /** 右侧的快捷键提示。 */
      hint?: string;
      disabled?: boolean;
      /** 危险操作（删除）用强调色。 */
      danger?: boolean;
      run: () => void;
    }
  | { kind: "submenu"; label: string; disabled?: boolean; items: ContextEntry[] };

interface Props {
  x: number;
  y: number;
  items: ContextEntry[];
  onClose: () => void;
}

const EDGE = 8;

export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });
  const [flip, setFlip] = useState(false);

  // 先渲染再量一次：贴边时往回收，避免菜单被窗口切掉。
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const left = Math.max(EDGE, Math.min(x, window.innerWidth - rect.width - EDGE));
    const top = Math.max(EDGE, Math.min(y, window.innerHeight - rect.height - EDGE));
    setPos({ left, top });
    // 子菜单默认往右展开，右边放不下就翻转
    setFlip(left + rect.width + 240 > window.innerWidth);
  }, [x, y, items]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    const onAnyContextMenu = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    // 滚动/改尺寸后菜单会错位，直接关掉（和系统右键菜单一致）
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    document.addEventListener("contextmenu", onAnyContextMenu, true);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("blur", onClose);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
      document.removeEventListener("contextmenu", onAnyContextMenu, true);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="wr-context-menu"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
    >
      <MenuList items={items} onClose={onClose} flip={flip} />
    </div>,
    document.body,
  );
}

function MenuList({
  items,
  onClose,
  flip,
}: {
  items: ContextEntry[];
  onClose: () => void;
  flip: boolean;
}) {
  return (
    <ul className="wr-menu-list" role="menu">
      {items.map((entry, index) => {
        if (entry.kind === "separator") {
          return <li key={`sep-${index}`} className="wr-menu-separator" role="separator" />;
        }

        if (entry.kind === "submenu") {
          return (
            <li key={`${entry.label}-${index}`} className="wr-menu-entry has-submenu">
              <button
                type="button"
                className="wr-menu-button"
                disabled={entry.disabled}
                aria-haspopup="menu"
              >
                <span className="wr-menu-label">{entry.label}</span>
                <span className="wr-menu-arrow" aria-hidden="true">
                  {flip ? "◀" : "▶"}
                </span>
              </button>
              <div className={flip ? "wr-submenu is-flipped" : "wr-submenu"}>
                <MenuList items={entry.items} onClose={onClose} flip={false} />
              </div>
            </li>
          );
        }

        return (
          <li key={`${entry.label}-${index}`} className="wr-menu-entry">
            <button
              type="button"
              className={entry.danger ? "wr-menu-button is-danger" : "wr-menu-button"}
              role="menuitem"
              disabled={entry.disabled}
              onClick={() => {
                onClose();
                entry.run();
              }}
            >
              <span className="wr-menu-label">{entry.label}</span>
              {entry.hint ? <kbd>{entry.hint}</kbd> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
