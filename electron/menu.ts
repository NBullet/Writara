import { app, Menu, type MenuItemConstructorOptions } from "electron";

import { createMenus, type MenuState } from "../src/commands/menus";
import type { MenuItem } from "../src/commands/menu";

/**
 * 原生菜单：结构直接来自 `src/commands/menus.ts`，命令 id 与 Web 版完全一致。
 *
 * 刻意不设 accelerator：
 * - 快捷键仍由渲染进程的 window 捕获阶段处理，它会跳过输入框与已打开的对话框；
 *   菜单 accelerator 没有这个判断，会在查找栏里误触发「加粗」这类命令。
 * - 等 M2 做了「按焦点启停菜单项」再接管快捷键。
 */

function toTemplate(items: MenuItem[], send: (id: string) => void): MenuItemConstructorOptions[] {
  return items.map((item) => {
    if (item.type === "separator") return { type: "separator" };

    if (item.type === "submenu") {
      return { label: item.label, submenu: toTemplate(item.items, send) };
    }

    const entry: MenuItemConstructorOptions = {
      label: item.label,
      enabled: !item.disabled,
      click: () => send(item.id),
    };
    if (item.checked !== undefined) {
      entry.type = "checkbox";
      entry.checked = item.checked;
    }
    return entry;
  });
}

export const DEFAULT_MENU_STATE: MenuState = {
  sidebarVisible: true,
  sidebarMode: "outline",
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  statusBar: true,
  style: "writara",
  lineEnding: "lf",
  utf8: true,
  spellcheck: true,
  smartPunctuation: false,
  hasCustomCss: false,
  recent: [],
  recentFolders: [],
  pandocAvailable: false,
};

export function buildApplicationMenu(
  state: MenuState,
  send: (id: string) => void,
): Menu {
  const menus = createMenus(state).map<MenuItemConstructorOptions>((menu) => ({
    label: menu.label,
    submenu: toTemplate(menu.items, send),
  }));

  if (process.platform === "darwin") {
    menus.unshift({
      label: app.name,
      submenu: [
        { role: "about" },
        { type: "separator" },
        { role: "hide" },
        { role: "hideOthers" },
        { role: "unhide" },
        { type: "separator" },
        { role: "quit" },
      ],
    });
  }

  return Menu.buildFromTemplate(menus);
}
