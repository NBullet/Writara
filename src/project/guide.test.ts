import { describe, expect, it } from "vitest";

import type { WorkspaceFile } from "../platform/types";
import { findGuideFile, rootGuideOf } from "./guide";

const file = (path: string): WorkspaceFile => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  ref: { name: path, native: null },
});

describe("rootGuideOf", () => {
  it("只认根目录，WRITARA.md 优先于 AGENTS.md", () => {
    expect(rootGuideOf([file("WRITARA.md"), file("AGENTS.md")])?.path).toBe("WRITARA.md");
    expect(rootGuideOf([file("AGENTS.md")])?.path).toBe("AGENTS.md");
    expect(rootGuideOf([file("book/WRITARA.md")])).toBeNull();
  });
});

describe("findGuideFile", () => {
  it("清单 instructions 指向的那份优先", () => {
    const files = [file("WRITARA.md"), file("docs/规范.md")];
    expect(findGuideFile(files, "a.md", "docs/规范.md")?.path).toBe("docs/规范.md");
  });

  it("取离文档最近的祖先目录，同目录 WRITARA.md 优先", () => {
    const files = [file("WRITARA.md"), file("book/AGENTS.md"), file("book/WRITARA.md"), file("book/ch/01.md")];
    expect(findGuideFile(files, "book/ch/01.md")?.path).toBe("book/WRITARA.md");
  });

  it("同目录有指令文件时优先于根目录", () => {
    const files = [file("AGENTS.md"), file("book/AGENTS.md"), file("book/01.md")];
    expect(findGuideFile(files, "book/01.md")?.path).toBe("book/AGENTS.md");
  });

  it("文档目录及其祖先都没有时退回根目录那份", () => {
    const files = [file("AGENTS.md"), file("book/ch/01.md")];
    expect(findGuideFile(files, "book/ch/01.md")?.path).toBe("AGENTS.md");
  });

  it("只有无关的兄弟目录规范时返回 null", () => {
    expect(findGuideFile([file("other/WRITARA.md")], "book/01.md")).toBeNull();
  });
});
