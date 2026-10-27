import { app, dialog } from "electron";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { promisify } from "node:util";
import { polishDocx } from "./docx";

/**
 * Pandoc 导出（Word / ePub）。
 *
 * 和 Typora 一样的思路：**不内置 Pandoc**，调用用户自己装的那一份。
 * 输入是渲染进程预处理过的 Markdown（不是 HTML），样式由 `--reference-doc`
 * 指定的内置模板提供；导出后再由 `docx.ts` 补页码页脚、目录域与图片段落居中。
 */

const run = promisify(execFile);

export type PandocFormat = "docx" | "epub";
export type DocxTemplate = "writara-cn" | "gongwen" | "tech" | "custom";

/** 随包发布的模板；`custom` 不走这里，由用户指定路径。 */
const TEMPLATE_IDS = new Set(["writara-cn", "gongwen", "tech"]);

export interface PandocDetectResult {
  path: string;
  version: string;
}

export interface PandocRequest {
  /** 预处理后的 Markdown 原文。 */
  markdown: string;
  suggestedName: string;
  format: PandocFormat;
  /** 用户在设置里指定的路径；留空则自动探测。 */
  pandocPath?: string;
  /** 文档所在目录，给 Pandoc 解析相对路径资源用。 */
  resourceDir?: string;
  title?: string;
  /** 参考模板 id；缺省用中文文稿。 */
  template?: DocxTemplate;
  /** `template === "custom"` 时的 .docx 绝对路径。 */
  customTemplate?: string;
  /** 生成目录（默认取文档里的 `[TOC]`）。 */
  toc?: boolean;
  numberSections?: boolean;
  pageNumbers?: boolean;
}

function candidates(configured?: string): string[] {
  const windowsLocal = process.env.LOCALAPPDATA
    ? path.join(process.env.LOCALAPPDATA, "Pandoc", "pandoc.exe")
    : "";
  const list = [
    configured?.trim(),
    "pandoc",
    "C:\\Program Files\\Pandoc\\pandoc.exe",
    windowsLocal,
    "/opt/homebrew/bin/pandoc",
    "/usr/local/bin/pandoc",
    "/usr/bin/pandoc",
  ];
  return list.filter((entry): entry is string => Boolean(entry));
}

/** 把 PATH 里的名字解析成绝对路径，写进设置才有意义。 */
async function resolveOnPath(name: string): Promise<string | null> {
  try {
    const command = process.platform === "win32" ? "where" : "which";
    const { stdout } = await run(command, [name], { timeout: 5000, windowsHide: true });
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}

/** 探测 Pandoc：`pandoc --version` 第一行必须像 `pandoc 3.x`。 */
export async function detectPandoc(configured?: string): Promise<PandocDetectResult | null> {
  for (const candidate of candidates(configured)) {
    try {
      const { stdout } = await run(candidate, ["--version"], { timeout: 8000, windowsHide: true });
      const version = (stdout.split(/\r?\n/)[0] ?? "").trim();
      if (!/^pandoc\b/i.test(version)) continue;

      // 候选是裸名字（走 PATH）时解析成绝对路径。
      const bare = !candidate.includes("/") && !candidate.includes("\\");
      const resolved = bare ? await resolveOnPath(candidate) : null;
      return { path: resolved ?? candidate, version };
    } catch {
      // 换下一个候选
    }
  }
  return null;
}

function outputName(name: string, format: PandocFormat): string {
  const base = name.replace(/\.(md|markdown|mdx|txt)$/i, "").trim() || "未命名";
  return `${base}.${format}`;
}

function describeFailure(error: unknown): string {
  const stderr = (error as { stderr?: string }).stderr?.trim();
  if (stderr) return stderr.split(/\r?\n/).slice(0, 3).join(" ");
  const message = error instanceof Error ? error.message : String(error);
  if (/ENOENT/.test(message)) return "没有找到 Pandoc，请先在设置里指定路径";
  if (/ETIMEDOUT|timed out/i.test(message)) return "Pandoc 执行超时";
  return message || "Pandoc 导出失败";
}

/** 模板就放在 resources/templates；打包后由 extraResources 复制到 resourcesPath。 */
function templateDirs(): string[] {
  const dirs = [path.join(app.getAppPath(), "resources", "templates")];
  if (app.isPackaged) dirs.unshift(path.join(process.resourcesPath, "templates"));
  return dirs;
}

async function exists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * 解析模板路径：内置 id → 随包模板；自定义 → 用户给的 .docx。
 * 模板缺失时返回 null，退回 Pandoc 默认样式（宁可丑一点，也不能让导出失败）。
 */
async function resolveTemplate(request: PandocRequest): Promise<string | null> {
  const custom = request.customTemplate?.trim();
  if (request.template === "custom" && custom && (await exists(custom))) return custom;

  const id = request.template && TEMPLATE_IDS.has(request.template) ? request.template : "writara-cn";
  for (const dir of templateDirs()) {
    const candidate = path.join(dir, `${id}.docx`);
    if (await exists(candidate)) return candidate;
  }
  return null;
}

/** Pandoc 2.x 没有 `mark` 扩展；`==高亮==` 在 3.x 才认。 */
function markdownReader(version: string): string {
  const major = /^pandoc\s+(\d+)/i.exec(version)?.[1];
  const supportsMark = Number(major ?? 0) >= 3;
  return supportsMark ? "markdown+mark-inline_notes-implicit_figures" : "markdown-inline_notes-implicit_figures";
}

export async function exportWithPandoc(request: PandocRequest): Promise<{ path: string } | null> {
  const found = await detectPandoc(request.pandocPath);
  if (!found) {
    throw new Error(
      "没有找到 Pandoc。请先安装（https://pandoc.org/installing.html），或在设置里指定 pandoc 可执行文件路径。",
    );
  }

  const result = await dialog.showSaveDialog({
    defaultPath: outputName(request.suggestedName, request.format),
    filters: [
      request.format === "docx"
        ? { name: "Word 文档", extensions: ["docx"] }
        : { name: "EPUB 电子书", extensions: ["epub"] },
    ],
  });
  if (result.canceled || !result.filePath) return null;
  const target = result.filePath;

  const tempSource = path.join(app.getPath("temp"), `writara-pandoc-${randomUUID()}.md`);
  await fs.writeFile(tempSource, request.markdown, "utf8");

  const args = ["-f", markdownReader(found.version), "-t", request.format, "-o", target, tempSource];
  if (request.title) args.push("--metadata", `title=${request.title}`);
  if (request.resourceDir) args.push(`--resource-path=${request.resourceDir}`);
  if (request.numberSections) args.push("--number-sections");

  // 目录：Markdown 里的 `[TOC]` 或设置项；ePub 的目录是阅读器导航，一直给。
  if (request.format === "epub" || request.toc) {
    args.push("--toc", "--metadata", "toc-title=目录");
  }

  if (request.format === "docx") {
    const template = await resolveTemplate(request);
    if (template) args.push(`--reference-doc=${template}`);
  }

  try {
    await run(found.path, args, { timeout: 180_000, windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
  } catch (error) {
    throw new Error(describeFailure(error), { cause: error });
  } finally {
    await fs.unlink(tempSource).catch(() => undefined);
  }

  if (request.format === "docx") {
    // 收尾失败不该让导出失败：文件已经写出来了，能打开就比报错强。
    await polishDocx(target, { toc: request.toc, pageNumbers: request.pageNumbers !== false }).catch(
      () => undefined,
    );
  }

  return { path: target };
}
