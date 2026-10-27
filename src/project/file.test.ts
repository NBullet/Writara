import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { platform, setPlatform } from "../platform";
import type { PlatformFs, WorkspaceRoot } from "../platform/types";
import { PROJECT_MANIFEST_PATH } from "../workspace/config";
import { createProjectFiles, readProject, writeProject } from "./file";
import { MATERIAL_DIR, parseProject } from "./manifest";

const previous = platform();
const root: WorkspaceRoot = { name: "长夜", native: null };

let files: Record<string, string>;
let dirs: string[];

function install(): void {
  files = {};
  dirs = [];
  const fake = {
    readRootFile: async (_root: WorkspaceRoot, path: string) =>
      path in files ? { text: files[path]!, encoding: "utf8" as const, bom: false } : null,
    writeRootFile: async (_root: WorkspaceRoot, path: string, text: string) => {
      files[path] = text;
    },
    createRootDir: async (_root: WorkspaceRoot, path: string) => {
      dirs.push(path);
    },
  } as unknown as PlatformFs;
  setPlatform(fake);
}

beforeEach(install);
afterAll(() => setPlatform(previous));

describe("readProject", () => {
  it("没有清单也没有指令文件：不是项目", async () => {
    await expect(readProject(root)).resolves.toEqual({
      manifest: null,
      invalid: null,
      guide: null,
      isProject: false,
    });
  });

  it("只有 WRITARA.md 也是项目，清单可缺省", async () => {
    files["WRITARA.md"] = "# 规范";
    const state = await readProject(root, []);

    expect(state.isProject).toBe(true);
    expect(state.guide).toBe("WRITARA.md");
    expect(state.manifest).toBeNull();
  });

  it("兼容 AGENTS.md；两份都在时优先 WRITARA.md", async () => {
    files["AGENTS.md"] = "# agents";
    expect((await readProject(root)).guide).toBe("AGENTS.md");

    files["WRITARA.md"] = "# writara";
    expect((await readProject(root)).guide).toBe("WRITARA.md");
  });

  it("清单正常时返回解析结果", async () => {
    files[PROJECT_MANIFEST_PATH] = '{"version":1,"title":"长夜","kind":"book"}';
    const state = await readProject(root);

    expect(state.invalid).toBeNull();
    expect(state.manifest?.title).toBe("长夜");
    expect(state.manifest?.kind).toBe("book");
    expect(state.isProject).toBe(true);
  });

  it("坏清单降级为普通文件夹并给出原因", async () => {
    files[PROJECT_MANIFEST_PATH] = "{oops";
    const state = await readProject(root);

    expect(state.manifest).toBeNull();
    expect(state.invalid).toBe("JSON 格式有误");
    // 有清单就算项目，用户仍能通过项目设置重建。
    expect(state.isProject).toBe(true);
  });
});

describe("writeProject / createProjectFiles", () => {
  it("写出的清单能被读回来", async () => {
    await writeProject(root, parseProjectOrThrow('{"title":"长夜","kind":"book"}'));
    const state = await readProject(root);

    expect(state.manifest?.title).toBe("长夜");
  });

  it("建资料目录；没有规范文件时补一份骨架", async () => {
    const saved = await createProjectFiles(root, parseProjectOrThrow('{"title":"长夜"}'), { guide: true });

    expect(dirs).toContain(MATERIAL_DIR);
    expect(files["WRITARA.md"]).toContain("# 写作规范");
    expect(files[PROJECT_MANIFEST_PATH]).toContain('"title": "长夜"');
    expect(saved.instructions).toBe("WRITARA.md");
  });

  it("已有的 WRITARA.md 不被覆盖", async () => {
    files["WRITARA.md"] = "原来的规范";
    await createProjectFiles(root, parseProjectOrThrow('{"title":"长夜"}'), { guide: true });

    expect(files["WRITARA.md"]).toBe("原来的规范");
    expect(files[PROJECT_MANIFEST_PATH]).toContain('"instructions": "WRITARA.md"');
  });

  it("已有 AGENTS.md 时沿用，不再另建 WRITARA.md", async () => {
    files["AGENTS.md"] = "原有的规范";
    const saved = await createProjectFiles(root, parseProjectOrThrow('{"title":"长夜"}'), { guide: true });

    expect(files["WRITARA.md"]).toBeUndefined();
    expect(saved.instructions).toBe("AGENTS.md");
    expect(files[PROJECT_MANIFEST_PATH]).toContain('"instructions": "AGENTS.md"');
  });
});

function parseProjectOrThrow(raw: string) {
  const result = parseProject(raw, "长夜");
  if (!result.ok) throw new Error(result.reason);
  return result.manifest;
}
