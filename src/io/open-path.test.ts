import { describe, expect, it } from "vitest";

import { DOCUMENT_EXT, normalizeOpenPath } from "./open-path";

describe("normalizeOpenPath", () => {
  it("正斜杠换成 Windows 反斜杠", () => {
    expect(normalizeOpenPath("E:/work-knowledge/03-Projects/华科知识库/06-上报.md")).toBe(
      "E:\\work-knowledge\\03-Projects\\华科知识库\\06-上报.md",
    );
  });

  it("保留已经是反斜杠的路径", () => {
    expect(normalizeOpenPath("E:\\notes\\a.md")).toBe("E:\\notes\\a.md");
  });

  it("去掉包裹的引号、反引号与零宽空格", () => {
    expect(normalizeOpenPath('  "E:\\notes\\a.md"  ')).toBe("E:\\notes\\a.md");
    expect(normalizeOpenPath("“E:\\notes\\a.md”")).toBe("E:\\notes\\a.md");
    expect(normalizeOpenPath("`E:\\notes\\a.md`")).toBe("E:\\notes\\a.md");
    expect(normalizeOpenPath("E:\\notes\\a.md\u200b")).toBe("E:\\notes\\a.md");
  });

  it("去掉从整句话里带出来的句号", () => {
    expect(normalizeOpenPath("E:/notes/a.md。")).toBe("E:\\notes\\a.md");
  });

  it("file:// 地址还原成路径并解码", () => {
    expect(normalizeOpenPath("file:///E:/notes/a%20b.md")).toBe("E:\\notes\\a b.md");
    expect(normalizeOpenPath("file://E:/notes/a.md")).toBe("E:\\notes\\a.md");
  });

  it("相对路径以当前文档所在目录为基准", () => {
    expect(normalizeOpenPath("03-Projects/a.md", { base: "E:\\repo\\00-Inbox\\note.md" })).toBe(
      "E:\\repo\\00-Inbox\\03-Projects\\a.md",
    );
    expect(normalizeOpenPath("../shared/a.md", { base: "E:\\repo\\00-Inbox\\note.md" })).toBe(
      "E:\\repo\\shared\\a.md",
    );
  });

  it("没有当前文档时以工作区根为基准", () => {
    expect(normalizeOpenPath("docs/a.md", { root: "E:\\repo" })).toBe("E:\\repo\\docs\\a.md");
  });

  it("既不是绝对路径也没有基准目录时返回 null", () => {
    expect(normalizeOpenPath("docs/a.md")).toBeNull();
    expect(normalizeOpenPath("   ")).toBeNull();
  });

  it("UNC 路径保持双反斜杠", () => {
    expect(normalizeOpenPath("//nas/share/notes/a.md")).toBe("\\\\nas\\share\\notes\\a.md");
  });
});

describe("DOCUMENT_EXT", () => {
  it("只认文档扩展名", () => {
    expect(DOCUMENT_EXT.test("a.MD")).toBe(true);
    expect(DOCUMENT_EXT.test("a.txt")).toBe(true);
    expect(DOCUMENT_EXT.test("a.pdf")).toBe(false);
  });
});
