import { describeFileError } from "../io/file-system";
import { platform } from "../platform";
import type { WorkspaceFile, WorkspaceRoot } from "../platform/types";
import { PROJECT_MANIFEST_PATH } from "../workspace/config";
import { GUIDE_FILES, rootGuideOf } from "./guide";
import { GUIDE_SKELETON, MATERIAL_DIR, parseProject, serializeProject, type ProjectManifest } from "./manifest";

/**
 * 项目身份与清单的读写。
 *
 * 项目 = 根目录有 `WRITARA.md` / `AGENTS.md`（指令文件），或有 `.writara/project.json`。
 * 指令文件是身份，清单只补「顺序 / 资料登记 / 导出默认值」。
 * 只有这里知道清单怎么落盘；组件与 hook 不碰平台层。
 * 读失败一律降级成普通文件夹（`manifest: null` + 原因），坏清单不能挡住打开文件。
 */

export interface ProjectState {
  /** null 表示没有可用清单；项目仍可能由指令文件成立。 */
  manifest: ProjectManifest | null;
  /** 非空表示清单存在但不可用；界面按普通文件夹处理，并提示一次。 */
  invalid: string | null;
  /** 根目录的指令文件路径（`WRITARA.md` / `AGENTS.md`）；没有就是 null。 */
  guide: string | null;
  /** 有指令文件或清单即为项目。 */
  isProject: boolean;
}

export const EMPTY_PROJECT: ProjectState = {
  manifest: null,
  invalid: null,
  guide: null,
  isProject: false,
};

/**
 * 探测根目录的指令文件。
 *
 * 扫描结果已经拿到时直接查（不读盘）；没传文件时逐个试读，
 * 供恢复会话等只拿到 root 的场景使用。
 */
async function detectGuide(root: WorkspaceRoot, files: WorkspaceFile[]): Promise<string | null> {
  const scanned = rootGuideOf(files)?.path ?? null;
  if (scanned) return scanned;
  // 扫描结果可能还没刷新（刚创建项目）：再直接探一次根目录。
  for (const name of GUIDE_FILES) {
    try {
      if (await platform().readRootFile(root, name)) return name;
    } catch {
      // 读不到就当没有；项目身份不能因为一次读失败而报错。
    }
  }
  return null;
}

export async function readProject(
  root: WorkspaceRoot,
  files: WorkspaceFile[] = [],
): Promise<ProjectState> {
  const guide = await detectGuide(root, files);
  const base: ProjectState = {
    manifest: null,
    invalid: null,
    guide,
    isProject: Boolean(guide),
  };

  try {
    const content = await platform().readRootFile(root, PROJECT_MANIFEST_PATH);
    if (!content) return base;
    const parsed = parseProject(content.text, root.name);
    if (!parsed.ok) return { ...base, invalid: parsed.reason, isProject: true };
    return { ...base, manifest: parsed.manifest, isProject: true };
  } catch (cause) {
    return { ...base, invalid: describeFileError(cause) };
  }
}

export async function writeProject(root: WorkspaceRoot, manifest: ProjectManifest): Promise<void> {
  await platform().writeRootFile(root, PROJECT_MANIFEST_PATH, serializeProject(manifest));
}

/**
 * 新建 / 转为项目：写清单、建资料目录，按需补一份指令文件。
 *
 * 已有的 `WRITARA.md` / `AGENTS.md` **不覆盖**（可能已经写了很久），
 * 两份都没有时才写 `WRITARA.md` 骨架。返回补好 `instructions` 的清单。
 */
export async function createProjectFiles(
  root: WorkspaceRoot,
  manifest: ProjectManifest,
  options: { guide: boolean },
): Promise<ProjectManifest> {
  let guide = await detectGuide(root, []);
  if (!guide && options.guide) {
    await platform().writeRootFile(root, GUIDE_FILES[0], GUIDE_SKELETON);
    guide = GUIDE_FILES[0];
  }

  const next: ProjectManifest = {
    ...manifest,
    instructions: manifest.instructions || guide || "",
  };
  await writeProject(root, next);
  await platform().createRootDir(root, MATERIAL_DIR);
  return next;
}
