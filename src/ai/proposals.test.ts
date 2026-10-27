import { describe, expect, it } from "vitest";

import type { WorkspaceFile } from "../platform/types";
import { parseProposal, proposalFiles } from "./proposals";

const text = (path: string): WorkspaceFile => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  ref: { name: path, native: null },
});

describe("提案文件", () => {
  it("解析 front matter 与完整新内容", () => {
    const source = [
      "---",
      "proposal: chapters/03.md",
      "title: 润色第三章",
      "note: 只改开头两段",
      "---",
      "",
      "# 第三章",
      "",
      "新内容。",
    ].join("\n");
    const proposal = parseProposal(".writara/proposals/a.proposal.md", source);
    expect(proposal).toMatchObject({
      target: "chapters/03.md",
      title: "润色第三章",
      note: "只改开头两段",
    });
    expect(proposal?.content).toBe("# 第三章\n\n新内容。");
  });

  it("缺少目标路径或不是 Markdown 目标时忽略", () => {
    expect(parseProposal("x.md", "---\ntitle: 无目标\n---\n正文")).toBeNull();
    expect(parseProposal("x.md", "---\nproposal: logo.png\n---\n正文")).toBeNull();
  });

  it("支持 target 别名与引号", () => {
    const proposal = parseProposal("x.md", `---\ntarget: "./a.md"\n---\n内容`);
    expect(proposal?.target).toBe("a.md");
    expect(proposal?.title).toBe("a.md");
  });

  it("没有 front matter 不算提案", () => {
    expect(parseProposal("x.md", "普通文档")).toBeNull();
  });

  it("只筛出提案目录里的文件", () => {
    const files = [
      text(".writara/proposals/a.proposal.md"),
      text(".writara/proposals/note.txt"),
      text(".writara/templates/t.md"),
      text("a.md"),
    ];
    expect(proposalFiles(files).map((file) => file.path)).toEqual([
      ".writara/proposals/a.proposal.md",
    ]);
  });
});
