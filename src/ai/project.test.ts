import { describe, expect, it } from "vitest";

import type { WorkspaceFile } from "../platform/types";
import { clipProjectText, pickProjectFile } from "./project";

const file = (path: string): WorkspaceFile => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  ref: { name: path, native: null },
});

describe("项目规范文件", () => {
  it("根目录的 WRITARA.md", () => {
    const picked = pickProjectFile([file("WRITARA.md"), file("a.md")], "a.md");
    expect(picked?.path).toBe("WRITARA.md");
  });

  it("离当前文档最近的祖先优先", () => {
    const files = [file("WRITARA.md"), file("book/WRITARA.md"), file("book/ch/01.md")];
    expect(pickProjectFile(files, "book/ch/01.md")?.path).toBe("book/WRITARA.md");
  });

  it("非祖先目录的规范不参与", () => {
    const files = [file("other/WRITARA.md"), file("book/01.md")];
    expect(pickProjectFile(files, "book/01.md")).toBeNull();
  });

  it("没有文档路径时取根目录那份", () => {
    const files = [file("book/WRITARA.md"), file("WRITARA.md")];
    expect(pickProjectFile(files, null)?.path).toBe("WRITARA.md");
  });
});

describe("规范截断", () => {
  it("短文本原样（去首尾空白）", () => {
    expect(clipProjectText("  术语表  ")).toBe("术语表");
  });

  it("超预算时截断并标注", () => {
    const text = "字".repeat(50);
    const clipped = clipProjectText(text, 10);
    expect(clipped.startsWith("字".repeat(10))).toBe(true);
    expect(clipped).toContain("已截断");
  });
});
