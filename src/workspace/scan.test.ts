import { describe, expect, it } from "vitest";

import { isMarkdownPath, scanAssets, scanDirectory } from "./scan";

interface FakeEntry {
  name: string;
  kind: "file" | "directory";
  children?: FakeEntry[];
}

function fakeDirectory(entries: FakeEntry[]): FileSystemDirectoryHandle {
  return {
    values: async function* values() {
      for (const entry of entries) {
        if (entry.kind === "directory") {
          yield {
            name: entry.name,
            kind: "directory",
            values: fakeDirectory(entry.children ?? []).values,
          };
        } else {
          yield { name: entry.name, kind: "file" };
        }
      }
    },
  } as unknown as FileSystemDirectoryHandle;
}

describe("isMarkdownPath", () => {
  it("只认 Markdown 与文本", () => {
    expect(isMarkdownPath("a.md")).toBe(true);
    expect(isMarkdownPath("a.markdown")).toBe(true);
    expect(isMarkdownPath("a.txt")).toBe(true);
    expect(isMarkdownPath("a.png")).toBe(false);
    expect(isMarkdownPath("a.pdf")).toBe(false);
  });
});

describe("scanDirectory", () => {
  it("递归收集、过滤扩展名与隐藏目录，并按路径排序", async () => {
    const root = fakeDirectory([
      { name: "b.md", kind: "file" },
      { name: "a.png", kind: "file" },
      {
        name: "notes",
        kind: "directory",
        children: [
          { name: "c.md", kind: "file" },
          { name: "deep", kind: "directory", children: [{ name: "d.markdown", kind: "file" }] },
        ],
      },
      { name: ".hidden", kind: "directory", children: [{ name: "x.md", kind: "file" }] },
      { name: "node_modules", kind: "directory", children: [{ name: "y.md", kind: "file" }] },
    ]);

    const files = await scanDirectory(root);
    expect(files.map((file) => file.path)).toEqual(["b.md", "notes/c.md", "notes/deep/d.markdown"]);
  });

  it("超过文件数上限就停止", async () => {
    const entries: FakeEntry[] = Array.from({ length: 10 }, (_, index) => ({
      name: `f${index}.md`,
      kind: "file" as const,
    }));
    const files = await scanDirectory(fakeDirectory(entries), { depth: 4, files: 3 });
    expect(files).toHaveLength(3);
  });
});

describe("scanAssets", () => {
  it("只收非 Markdown 文件，跳过隐藏目录", async () => {
    const root = fakeDirectory([
      { name: "a.md", kind: "file" },
      { name: "封面.png", kind: "file" },
      {
        name: "assets",
        kind: "directory",
        children: [{ name: "报告.pdf", kind: "file" }],
      },
      { name: ".git", kind: "directory", children: [{ name: "x.png", kind: "file" }] },
    ]);

    const assets = await scanAssets(root);
    expect(assets.map((asset) => asset.path)).toEqual(["封面.png", "assets/报告.pdf"]);
  });
});
