import { describe, expect, it } from "vitest";

import { absoluteTarget, isAttachmentTarget } from "./attachment";

describe("isAttachmentTarget", () => {
  it("认出常见附件类型", () => {
    expect(isAttachmentTarget("报告.pdf")).toBe(true);
    expect(isAttachmentTarget("附件/说明.docx")).toBe(true);
    expect(isAttachmentTarget("data.xlsx")).toBe(true);
    expect(isAttachmentTarget("assets/demo.zip")).toBe(true);
    expect(isAttachmentTarget("<带 空格.pdf>")).toBe(true);
  });

  it("带查询串或锚点时只看路径部分", () => {
    expect(isAttachmentTarget("a.pdf?download=1")).toBe(true);
    expect(isAttachmentTarget("a.pdf#page=2")).toBe(true);
  });

  it("Windows 绝对路径算附件，不会被当成协议", () => {
    expect(isAttachmentTarget("C:/Users/a/报告.pdf")).toBe(true);
    expect(isAttachmentTarget("D:\\files\\x.zip")).toBe(true);
    expect(isAttachmentTarget("/home/user/a.pdf")).toBe(true);
  });

  it("链接、锚点、图片、Markdown 都不算附件", () => {
    expect(isAttachmentTarget("https://example.com/a.pdf")).toBe(false);
    expect(isAttachmentTarget("mailto:a@b.com")).toBe(false);
    expect(isAttachmentTarget("#标题")).toBe(false);
    expect(isAttachmentTarget("image.png")).toBe(false);
    expect(isAttachmentTarget("notes.md")).toBe(false);
    expect(isAttachmentTarget("")).toBe(false);
  });
});

describe("absoluteTarget", () => {
  it("相对路径拼到文档目录", () => {
    expect(absoluteTarget("E:/notes/a.md", "a.assets/x.pdf")).toBe("E:/notes/a.assets/x.pdf");
    expect(absoluteTarget("E:\\notes\\a.md", "a.assets/x.pdf")).toBe("E:/notes/a.assets/x.pdf");
    expect(absoluteTarget("E:/notes/a.md", "./x.pdf")).toBe("E:/notes/x.pdf");
  });

  it("处理上级目录与 URL 编码", () => {
    expect(absoluteTarget("E:/notes/sub/a.md", "../img/y.pdf")).toBe("E:/notes/img/y.pdf");
    expect(absoluteTarget("E:/notes/a.md", "%E6%8A%A5%E5%91%8A.pdf")).toBe("E:/notes/报告.pdf");
  });

  it("绝对路径原样返回", () => {
    expect(absoluteTarget("E:/notes/a.md", "D:/other/x.pdf")).toBe("D:/other/x.pdf");
    expect(absoluteTarget("E:/notes/a.md", "/tmp/x.pdf")).toBe("/tmp/x.pdf");
  });
});
