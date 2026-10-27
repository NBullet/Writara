import { describe, expect, it } from "vitest";

import type { WorkspaceFile } from "../platform/types";
import { workspaceTemplates } from "./templates";

const file = (path: string): WorkspaceFile => ({
  name: path.slice(path.lastIndexOf("/") + 1),
  path,
  ref: { name: path, native: null },
});

describe("工作区模板", () => {
  it("只收 .writara/templates/ 下的 Markdown", () => {
    const templates = workspaceTemplates([
      file(".writara/templates/方案.md"),
      file(".writara/proposals/x.proposal.md"),
      file("正文.md"),
    ]);
    expect(templates.map((tpl) => tpl.name)).toEqual(["方案"]);
    expect(templates[0]!.id).toBe("tpl-.writara/templates/方案.md");
  });

  it("子目录模板带目录名，便于区分同名文件", () => {
    const templates = workspaceTemplates([file(".writara/templates/团队/周报.md")]);
    expect(templates[0]!.name).toBe("周报（团队）");
  });

  it("没有模板时为空", () => {
    expect(workspaceTemplates([])).toEqual([]);
  });
});
