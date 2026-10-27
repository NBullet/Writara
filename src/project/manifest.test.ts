import { describe, expect, it } from "vitest";

import { createManifest, parseProject, serializeProject } from "./manifest";

function manifestOf(raw: string, fallback = "文件夹") {
  const result = parseProject(raw, fallback);
  if (!result.ok) throw new Error(result.reason);
  return result.manifest;
}

describe("parseProject", () => {
  it("最小清单补齐所有默认值", () => {
    const manifest = manifestOf('{"version":1,"title":"长夜","kind":"book"}');

    expect(manifest.title).toBe("长夜");
    expect(manifest.kind).toBe("book");
    expect(manifest.instructions).toBe("");
    expect(manifest.order).toBe("natural");
    expect(manifest.spine).toEqual([]);
    expect(manifest.resources).toEqual([]);
    expect(manifest.exclude).toEqual([]);
    expect(manifest.export).toEqual({ toc: false, chapterBreak: true });
  });

  it("缺标题时退回文件夹名，未知类型退回 general", () => {
    const manifest = manifestOf('{"kind":"poetry"}', "我的文件夹");

    expect(manifest.title).toBe("我的文件夹");
    expect(manifest.kind).toBe("general");
  });

  it("坏 JSON 与数组不抛错，只返回原因", () => {
    expect(parseProject("{oops", "笔记")).toEqual({ ok: false, reason: "JSON 格式有误" });
    expect(parseProject("[]", "笔记").ok).toBe(false);
    expect(parseProject("null", "笔记").ok).toBe(false);
  });

  it("版本高于当前版本时拒绝解析", () => {
    const result = parseProject('{"version":2,"title":"未来"}', "笔记");

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("version 2");
  });

  it("spine 丢掉越界路径并去重", () => {
    const manifest = manifestOf(
      JSON.stringify({
        spine: ["01.md", "../secret.md", "/etc/passwd", "C:\\win.md", "a/../b.md", "01.md", "卷二/02.md"],
      }),
    );

    expect(manifest.spine).toEqual(["01.md", "卷二/02.md"]);
    // 旧清单没有 order：有 spine 视为自定义序。
    expect(manifest.order).toBe("custom");
  });

  it("order 只认 natural / custom，custom 允许空 spine", () => {
    expect(manifestOf('{"order":"custom"}').order).toBe("custom");
    expect(manifestOf('{"order":"natural","spine":["01.md"]}').order).toBe("natural");
    expect(manifestOf('{"order":"random"}').order).toBe("natural");
  });

  it("resources 校验路径、补默认角色并去重", () => {
    const manifest = manifestOf(
      JSON.stringify({
        resources: [
          { path: "资料/人物.md" },
          { path: "资料/人物.md", role: "characters" },
          { path: "../秘密.md", role: "data" },
          { path: "资料/时间线.md", role: "timeline" },
        ],
      }),
    );

    expect(manifest.resources).toEqual([
      { path: "资料/人物.md", role: "reference" },
      { path: "资料/时间线.md", role: "timeline" },
    ]);
  });

  it("exclude 规范反斜杠并保留目录结尾", () => {
    const manifest = manifestOf(JSON.stringify({ exclude: ["资料\\", "../外面", "草稿"] }));

    expect(manifest.exclude).toEqual(["资料/", "草稿"]);
  });

  it("instructions 越界时退回自动规则", () => {
    expect(manifestOf('{"instructions":"../规范.md"}').instructions).toBe("");
    expect(manifestOf('{"instructions":"docs/规范.md"}').instructions).toBe("docs/规范.md");
  });

  it("export 只认布尔值，chapterBreak 缺省为开", () => {
    expect(manifestOf('{"export":{"toc":true}}').export).toEqual({ toc: true, chapterBreak: true });
    expect(manifestOf('{"export":{"chapterBreak":false,"toc":"yes"}}').export).toEqual({
      toc: false,
      chapterBreak: false,
    });
  });
});

describe("serializeProject", () => {
  it("写出去再读回来不丢字段", () => {
    const manifest = {
      ...createManifest("长夜", "book"),
      description: "一部小说",
      instructions: "WRITARA.md",
      spine: ["01.md", "卷二/02.md"],
      resources: [{ path: "资料/人物.md", role: "characters" }],
      exclude: ["资料/"],
      export: { toc: true, chapterBreak: false },
    };

    expect(manifestOf(serializeProject(manifest))).toEqual(manifest);
  });

  it("序列化结果稳定且以换行结尾", () => {
    const text = serializeProject(createManifest("长夜", "book"));

    expect(text.endsWith("\n")).toBe(true);
    expect(text).toContain('"version": 1');
    expect(text).toContain('"kind": "book"');
  });
});
