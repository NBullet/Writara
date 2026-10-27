import { describe, expect, it } from "vitest";

import { buildFileTree, folderPathsOf } from "./tree";
import type { WorkspaceAsset, WorkspaceFile } from "../platform/types";

function file(path: string): WorkspaceFile {
  return { name: path.split("/").pop() ?? path, path, ref: { name: path, native: path } };
}

function asset(path: string): WorkspaceAsset {
  return {
    name: path.split("/").pop() ?? path,
    path,
    kind: "attachment",
    ref: { name: path, native: path },
  };
}

describe("buildFileTree", () => {
  it("把路径折叠成目录树，目录在前", () => {
    const tree = buildFileTree([file("b.md"), file("notes/a.md"), file("notes/deep/c.md")]);

    expect(tree.map((node) => node.name)).toEqual(["notes", "b.md"]);
    expect(tree[0]?.children.map((node) => node.name)).toEqual(["deep", "a.md"]);
    expect(tree[0]?.children[0]?.children[0]?.file?.path).toBe("notes/deep/c.md");
    expect(tree[1]?.file?.path).toBe("b.md");
  });

  it("同名文件在同一目录下合并", () => {
    const tree = buildFileTree([file("a/x.md"), file("a/y.md")]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children).toHaveLength(2);
  });

  it("资源与正文共用目录，正文排在资源前", () => {
    const tree = buildFileTree([file("ch/01.md")], [asset("ch/图.png"), asset("封面.pdf")]);

    expect(tree.map((node) => node.name)).toEqual(["ch", "封面.pdf"]);
    expect(tree[0]?.children.map((node) => node.name)).toEqual(["01.md", "图.png"]);
    expect(tree[0]?.children[1]?.asset?.path).toBe("ch/图.png");
  });

  it("空列表返回空树", () => {
    expect(buildFileTree([])).toEqual([]);
  });
});

describe("folderPathsOf", () => {
  it("列出文件的所有祖先目录（带结尾斜杠）", () => {
    expect(folderPathsOf("a/b/c.md")).toEqual(["a/", "a/b/"]);
    expect(folderPathsOf("c.md")).toEqual([]);
  });
});