// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import { createBrowserFs } from "./browser";

function fakeFileHandle(name: string, written: string[]): FileSystemFileHandle {
  return {
    name,
    queryPermission: async () => "granted" as PermissionState,
    getFile: async () => new File(["old"], name, { type: "text/markdown" }),
    createWritable: async () => ({
      write: async (text: string) => {
        written.push(text);
      },
      close: async () => undefined,
    }),
    move: async () => undefined,
  } as unknown as FileSystemFileHandle;
}

describe("browser platform", () => {
  it("ref 可以序列化后还原成同一个句柄", () => {
    const fs = createBrowserFs();
    const handle = fakeFileHandle("笔记.md", []);
    const back = fs.deserializeRef(fs.serializeRef({ name: "笔记.md", native: handle }));

    expect(back?.name).toBe("笔记.md");
    expect(back?.native).toBe(handle);
  });

  it("坏的序列化值还原为 null，而不是崩掉", () => {
    const fs = createBrowserFs();
    expect(fs.deserializeRef(undefined)).toBeNull();
    expect(fs.deserializeRef("not-a-handle")).toBeNull();
    expect(fs.deserializeRoot({ name: 1 })).toBeNull();
  });

  it("有 ref 时 save 直接写回原文件", async () => {
    const fs = createBrowserFs();
    const written: string[] = [];
    const handle = fakeFileHandle("笔记.md", written);

    const result = await fs.save({
      text: "新内容",
      suggestedName: "笔记.md",
      ref: { name: "笔记.md", native: handle },
    });

    expect(written).toEqual(["新内容"]);
    expect(result?.downloaded).toBe(false);
    expect(result?.ref?.name).toBe("笔记.md");
  });

  it("scan 把目录内容映射成带 ref 的 WorkspaceFile", async () => {
    const root = {
      name: "notes",
      values: async function* values() {
        yield { name: "a.md", kind: "file" };
        yield { name: "img.png", kind: "file" };
      },
    } as unknown as FileSystemDirectoryHandle;

    const files = await createBrowserFs().scan({ name: "notes", native: root });

    expect(files.map((file) => file.path)).toEqual(["a.md"]);
    expect(files[0]?.ref.name).toBe("a.md");
  });

  it("重命名保留父目录路径", async () => {
    const fs = createBrowserFs();
    const handle = fakeFileHandle("旧名.md", []);
    const root = { name: "notes", native: {} as FileSystemDirectoryHandle };

    const next = await fs.renameFile(root, { name: "旧名.md", path: "notes/旧名.md", ref: { name: "旧名.md", native: handle } }, "新名");

    expect(next.path).toBe("notes/新名.md");
    expect(next.name).toBe("新名.md");
  });

  it("文件不存在时 read 返回 null", async () => {
    const fs = createBrowserFs();
    const handle = {
      name: "走了.md",
      getFile: async () => {
        throw new DOMException("gone", "NotFoundError");
      },
    } as unknown as FileSystemFileHandle;

    expect(await fs.read({ name: "走了.md", native: handle })).toBeNull();
  });
});
