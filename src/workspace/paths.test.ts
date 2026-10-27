import { describe, expect, it } from "vitest";

import { getFileByPath, resolveRelativePath, safeRelativePath } from "./paths";

describe("resolveRelativePath", () => {
  it("同目录与子目录", () => {
    expect(resolveRelativePath("notes/a.md", "img.png")).toBe("notes/img.png");
    expect(resolveRelativePath("notes/a.md", "./img.png")).toBe("notes/img.png");
    expect(resolveRelativePath("notes/a.md", "assets/img.png")).toBe("notes/assets/img.png");
  });

  it("上一级目录", () => {
    expect(resolveRelativePath("notes/a.md", "../assets/img.png")).toBe("assets/img.png");
    expect(resolveRelativePath("a.md", "../img.png")).toBeNull();
  });

  it("忽略外部地址与绝对路径", () => {
    expect(resolveRelativePath("a.md", "https://example.com/a.png")).toBeNull();
    expect(resolveRelativePath("a.md", "data:image/png;base64,AAA")).toBeNull();
    expect(resolveRelativePath("a.md", "/assets/a.png")).toBeNull();
    expect(resolveRelativePath("a.md", "#anchor")).toBeNull();
  });

  it("中文文件名会解码", () => {
    expect(resolveRelativePath("a.md", "%E5%9B%BE.png")).toBe("图.png");
  });
});

describe("safeRelativePath", () => {
  it("保留合法的相对路径并统一分隔符", () => {
    expect(safeRelativePath("资料/人物.md")).toBe("资料/人物.md");
    expect(safeRelativePath(".writara/project.json")).toBe(".writara/project.json");
    expect(safeRelativePath("笔记\\a.md")).toBe("笔记/a.md");
    expect(safeRelativePath("./a.md")).toBe("a.md");
  });

  it("拒绝绝对路径、盘符与越界段", () => {
    expect(safeRelativePath("/etc/passwd")).toBeNull();
    expect(safeRelativePath("C:\\secret.md")).toBeNull();
    expect(safeRelativePath("../secret.md")).toBeNull();
    expect(safeRelativePath("a/../../b.md")).toBeNull();
    expect(safeRelativePath("")).toBeNull();
    expect(safeRelativePath(42)).toBeNull();
  });
});

function fakeRoot(tree: Record<string, string[]>): FileSystemDirectoryHandle {
  const make = (prefix: string, files: string[]): FileSystemDirectoryHandle =>
    ({
      getDirectoryHandle: async (name: string) => {
        const key = `${prefix}${name}/`;
        const nested = Object.keys(tree).find((path) => path.startsWith(key));
        if (!nested) throw new DOMException("missing", "NotFoundError");
        return make(key, tree[key] ?? []);
      },
      getFileHandle: async (name: string) => {
        if (!files.includes(name)) throw new DOMException("missing", "NotFoundError");
        return { name } as FileSystemFileHandle;
      },
    }) as unknown as FileSystemDirectoryHandle;

  return make("", tree[""] ?? []);
}

describe("getFileByPath", () => {
  const root = fakeRoot({ "": [], "notes/": ["a.md"], "notes/assets/": ["pic.png"] });

  it("找到嵌套文件", async () => {
    const file = await getFileByPath(root, "notes/assets/pic.png");
    expect(file?.name).toBe("pic.png");
  });

  it("找不到时返回 null", async () => {
    expect(await getFileByPath(root, "notes/missing.png")).toBeNull();
    expect(await getFileByPath(root, "nope/pic.png")).toBeNull();
  });
});
