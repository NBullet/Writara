// @vitest-environment jsdom
import { describe, expect, it } from "vitest";

import {
  describeFileError,
  downloadMarkdown,
  normalizeFileName,
  saveDocument,
  supportsDiskAccess,
} from "./file-system";

function fakeHandle(name: string, written: string[]): FileSystemFileHandle {
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
  } as unknown as FileSystemFileHandle;
}

describe("normalizeFileName", () => {
  it("缺少扩展名时补 .md", () => {
    expect(normalizeFileName("笔记")).toBe("笔记.md");
    expect(normalizeFileName("  a.md  ")).toBe("a.md");
    expect(normalizeFileName("a.markdown")).toBe("a.markdown");
    expect(normalizeFileName("")).toBe("未命名.md");
  });
});

describe("supportsDiskAccess", () => {
  it("jsdom 没有 File System Access，应返回 false", () => {
    expect(supportsDiskAccess()).toBe(false);
  });
});

describe("saveDocument", () => {
  it("有句柄时直接写回原文件", async () => {
    const written: string[] = [];
    const handle = fakeHandle("笔记.md", written);

    const result = await saveDocument("新内容", { handle, suggestedName: "笔记.md" });

    expect(written).toEqual(["新内容"]);
    expect(result).toMatchObject({ name: "笔记.md", downloaded: false });
    expect(result?.handle).toBe(handle);
  });

  it("没有 API 且没有句柄时退化为下载", async () => {
    const clicks: string[] = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => "blob:fake";

    try {
      const result = await saveDocument("内容", { handle: null, suggestedName: "草稿" });
      expect(result).toMatchObject({ name: "草稿.md", downloaded: true });
      expect(clicks).toEqual(["草稿.md"]);
    } finally {
      HTMLAnchorElement.prototype.click = original;
      URL.createObjectURL = createObjectURL;
    }
  });

  it("权限被拒时抛错而不是静默失败", async () => {
    const handle = {
      name: "拒绝.md",
      queryPermission: async () => "denied" as PermissionState,
      requestPermission: async () => "denied" as PermissionState,
      createWritable: async () => {
        throw new Error("should not write");
      },
    } as unknown as FileSystemFileHandle;

    await expect(saveDocument("x", { handle, suggestedName: "拒绝.md" })).rejects.toThrow("没有写入该文件的权限");
  });
});

describe("downloadMarkdown", () => {
  it("文件名补全后触发下载", () => {
    const clicks: string[] = [];
    const original = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      clicks.push(this.download);
    };
    const createObjectURL = URL.createObjectURL;
    URL.createObjectURL = () => "blob:fake";

    try {
      downloadMarkdown("周报", "内容");
      expect(clicks).toEqual(["周报.md"]);
    } finally {
      HTMLAnchorElement.prototype.click = original;
      URL.createObjectURL = createObjectURL;
    }
  });
});

describe("describeFileError", () => {
  it("把 DOMException 翻成用户能懂的话", () => {
    expect(describeFileError(new DOMException("nope", "NotAllowedError"))).toBe("没有文件访问权限");
    expect(describeFileError(new DOMException("gone", "NotFoundError"))).toBe("文件不存在或已被移动");
    expect(describeFileError(new Error("磁盘满了"))).toBe("磁盘满了");
    expect(describeFileError(undefined)).toBe("文件操作失败");
  });
});
