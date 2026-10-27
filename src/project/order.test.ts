import { describe, expect, it } from "vitest";

import type { WorkspaceFile } from "../platform/types";
import { createManifest } from "./manifest";
import {
  isExcludedPath,
  missingSpineEntries,
  naturalOrder,
  orderedDocuments,
  projectDocuments,
  unlistedDocuments,
} from "./order";

const file = (path: string): WorkspaceFile => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  ref: { name: path, native: null },
});

const files = [
  file("WRITARA.md"),
  file("02-承.md"),
  file("01-起.md"),
  file("资料/人物.md"),
  file("附录/草稿.md"),
];

describe("isExcludedPath", () => {
  it("目录前缀与完整路径两种写法", () => {
    expect(isExcludedPath("附录/草稿.md", ["附录/"])).toBe(true);
    expect(isExcludedPath("附录/草稿.md", ["附录"])).toBe(false);
    expect(isExcludedPath("附录/草稿.md", ["附录/草稿.md"])).toBe(true);
  });
});

describe("projectDocuments", () => {
  it("去掉指令文件、资料区与被排除的正文，并按路径排序", () => {
    const manifest = createManifest("长夜", "book");
    manifest.exclude = ["附录/"];
    expect(projectDocuments(files, manifest).map((entry) => entry.path)).toEqual([
      "01-起.md",
      "02-承.md",
    ]);
  });

  it("没有清单时同样排除资料区", () => {
    expect(projectDocuments(files, null).map((entry) => entry.path)).toEqual([
      "01-起.md",
      "02-承.md",
      "附录/草稿.md",
    ]);
  });
});

describe("orderedDocuments", () => {
  it("自然序按路径", () => {
    const manifest = createManifest("长夜", "book");
    expect(orderedDocuments(files, manifest).map((entry) => entry.path)).toEqual([
      "01-起.md",
      "02-承.md",
      "附录/草稿.md",
    ]);
  });

  it("自定义序只取 spine，并按 spine 排列", () => {
    const manifest = createManifest("长夜", "book");
    manifest.order = "custom";
    manifest.spine = ["02-承.md", "01-起.md", "已经删掉.md"];

    expect(orderedDocuments(files, manifest).map((entry) => entry.path)).toEqual([
      "02-承.md",
      "01-起.md",
    ]);
  });

  it("custom 但 spine 为空时退回自然序，避免导出一片空白", () => {
    const manifest = createManifest("长夜", "book");
    manifest.order = "custom";
    expect(orderedDocuments(files, manifest).map((entry) => entry.path)).toEqual([
      "01-起.md",
      "02-承.md",
      "附录/草稿.md",
    ]);
  });
});

describe("缺失与未加入", () => {
  it("分别给出 spine 里已删除的条目与尚未加入的正文", () => {
    const manifest = createManifest("长夜", "book");
    manifest.order = "custom";
    manifest.spine = ["01-起.md", "已经删掉.md"];

    expect(missingSpineEntries(files, manifest)).toEqual(["已经删掉.md"]);
    expect(unlistedDocuments(files, manifest).map((entry) => entry.path)).toEqual([
      "02-承.md",
      "附录/草稿.md",
    ]);
  });
});

describe("naturalOrder", () => {
  it("不改原数组", () => {
    const input = [file("b.md"), file("a.md")];
    const sorted = naturalOrder(input);
    expect(sorted.map((entry) => entry.path)).toEqual(["a.md", "b.md"]);
    expect(input.map((entry) => entry.path)).toEqual(["b.md", "a.md"]);
  });
});
