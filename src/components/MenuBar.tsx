import { useEffect, useRef, useState } from "react";

import { displayShortcut, type Menu, type MenuItem } from "../commands/menu";

interface Props {
  menus: Menu[];
  onCommand: (id: string) => void;
}

function SubmenuEntry({ item, onCommand }: { item: Extract<MenuItem, { type: "submenu" }>; onCommand: (id: string) => void }) {
  const [open, setOpen] = useState(false);

  return (
    <li
      className={open ? "wr-menu-entry has-submenu is-open" : "wr-menu-entry has-submenu"}
      role="none"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        role="menuitem"
        aria-haspopup="true"
        aria-expanded={open}
        className="wr-menu-button"
        onClick={() => setOpen((value) => !value)}
      >
        <span>{item.label}</span>
        <span className="wr-menu-arrow" aria-hidden="true">
          ▸
        </span>
      </button>
      <div className="wr-submenu">
        <SubMenu items={item.items} onCommand={onCommand} />
      </div>
    </li>
  );
}

function SubMenu({ items, onCommand }: { items: MenuItem[]; onCommand: (id: string) => void }) {
  return (
    <ul className="wr-menu-list" role="menu">
      {items.map((item, index) => {
        if (item.type === "separator") return <li key={`sep-${index}`} className="wr-menu-separator" role="separator" />;

        if (item.type === "submenu") {
          return <SubmenuEntry key={item.id} item={item} onCommand={onCommand} />;
        }

        return (
          <li key={item.id} role="none">
            <button
              type="button"
              role="menuitem"
              className="wr-menu-button"
              disabled={item.disabled}
              onClick={() => onCommand(item.id)}
            >
              <span className="wr-menu-check" aria-hidden="true">
                {item.checked ? "✓" : ""}
              </span>
              <span className="wr-menu-label">{item.label}</span>
              {item.shortcut ? <kbd>{displayShortcut(item.shortcut)}</kbd> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function MenuBar({ menus, onCommand }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  return (
    <div className="wr-menubar" ref={rootRef} role="menubar">
      {menus.map((menu) => (
        <div key={menu.id} className="wr-menu">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="true"
            aria-expanded={open === menu.id}
            className={open === menu.id ? "wr-menu-title is-open" : "wr-menu-title"}
            onClick={() => setOpen((value) => (value === menu.id ? null : menu.id))}
            onMouseEnter={() => {
              if (open) setOpen(menu.id);
            }}
          >
            {menu.label}
          </button>
          {open === menu.id ? (
            <div className="wr-menu-dropdown">
              <SubMenu
                items={menu.items}
                onCommand={(id) => {
                  setOpen(null);
                  onCommand(id);
                }}
              />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
