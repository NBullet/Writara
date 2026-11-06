import { describe, expect, it } from "vitest";

import { createMenus, type MenuState } from "./menus";

const BASE: MenuState = {
  sidebarVisible: true,
  sidebarMode: "outline",
  sourceMode: false,
  focusMode: false,
  typewriterMode: false,
  paper: "a4",
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

/** 找到文件菜单里的某个子菜单。 */
function submenu(state: MenuState, id: string) {
  const file = createMenus(state).find((menu) => menu.id === "file");
  const entry = file?.items.find((item) => item.type === "submenu" && item.id === id);
  return entry && entry.type === "submenu" ? entry : null;
}

describe("最近文件 / 文件夹的菜单项", () => {
  it("优先使用带路径的 id（多窗口时不会因为列表顺序不同而错位）", () => {
    const state = {
      ...BASE,
      recent: ["笔记.md"],
      recentIds: ["recent-file:C%3A%5Cnotes%5C%E7%AC%94%E8%AE%B0.md"],
      recentFolders: ["notes"],
      recentFolderIds: ["recent-folder:C%3A%5Cnotes"],
    };

    const files = submenu(state, "recent");
    expect(files?.items[0]).toMatchObject({
      type: "item",
      id: "recent-file:C%3A%5Cnotes%5C%E7%AC%94%E8%AE%B0.md",
      label: "笔记.md",
    });

    const folders = submenu(state, "recent-folders");
    expect(folders?.items[0]).toMatchObject({
      type: "item",
      id: "recent-folder:C%3A%5Cnotes",
      label: "notes",
    });
  });

  it("没有 id 列表时退回下标（浏览器端）", () => {
    const state = { ...BASE, recent: ["a.md", "b.md"], recentFolders: ["proj"] };
    expect(submenu(state, "recent")?.items[0]).toMatchObject({ id: "recent-0" });
    expect(submenu(state, "recent")?.items[1]).toMatchObject({ id: "recent-1" });
    expect(submenu(state, "recent-folders")?.items[0]).toMatchObject({ id: "recent-folder-0" });
  });

  it("没有最近记录时给 disabled 占位，而不是空子菜单", () => {
    expect(submenu(BASE, "recent")?.items[0]).toMatchObject({
      type: "item",
      disabled: true,
    });
    expect(submenu(BASE, "recent-folders")?.items[0]).toMatchObject({
      type: "item",
      disabled: true,
    });
  });
});

describe("版面菜单", () => {
  const layoutMenu = (state: MenuState) =>
    createMenus(state)
      .find((menu) => menu.id === "view")
      ?.items.find((entry) => entry.type === "submenu" && entry.id === "layout");

  it("只有当前版面被勾选", () => {
    const entry = layoutMenu({ ...BASE, paper: "auto" });
    expect(entry?.type).toBe("submenu");
    if (entry?.type !== "submenu") return;
    const checked = entry.items.flatMap((item) =>
      item.type === "item" && item.checked ? [item.id] : [],
    );
    expect(checked).toEqual(["layout-auto"]);
  });

  it("纵向 / 横向 / Letter 都能选", () => {
    const entry = layoutMenu({ ...BASE, paper: "a4-landscape" });
    if (entry?.type !== "submenu") throw new Error("缺少版面子菜单");
    expect(entry.items.map((item) => (item.type === "item" ? item.id : ""))).toEqual(
      expect.arrayContaining(["layout-a4", "layout-a4-landscape", "layout-auto", "layout-letter"]),
    );
  });
});

describe("按路径打开", () => {
  const fileIds = (state: MenuState) =>
    createMenus(state)
      .find((menu) => menu.id === "file")
      ?.items.flatMap((entry) => (entry.type === "separator" ? [] : [entry.id]));

  it("只在桌面端出现", () => {
    expect(fileIds({ ...BASE, desktop: true })).toContain("open-path");
    expect(fileIds(BASE)).not.toContain("open-path");
  });
});
