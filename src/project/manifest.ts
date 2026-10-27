import { safeRelativePath } from "../workspace/paths";

/**
 * 项目清单（`.writara/project.json`）。
 *
 * 纯数据：解析、校验、序列化都在这里，不碰平台层，方便单测。
 * 清单是**机器状态**，只由应用写；AI 只读，用户手改按「读时兜底」处理。
 * 契约见 `docs/project-mode.md` §3。
 */

export const PROJECT_VERSION = 1;

export type ProjectKind = "book" | "docs" | "notes" | "general";

export const PROJECT_KINDS: Array<{ value: ProjectKind; label: string }> = [
  { value: "book", label: "书稿" },
  { value: "docs", label: "文档" },
  { value: "notes", label: "笔记" },
  { value: "general", label: "通用" },
];

export interface ProjectResource {
  /** 相对项目根的路径，`/` 分隔。 */
  path: string;
  /** 角色：`characters | timeline | reference | data`，也可以是自定义值。 */
  role: string;
}

export interface ProjectExportOptions {
  /** 项目级导出时生成目录。 */
  toc: boolean;
  /** 每章另起一页。 */
  chapterBreak: boolean;
}

/** 正文顺序：自然序（按路径排序）或自定义序（按 `spine`）。 */
export type ProjectOrder = "natural" | "custom";

export interface ProjectManifest {
  version: number;
  title: string;
  kind: ProjectKind;
  description: string;
  /** 规范文件路径；空串表示沿用「离文档最近的祖先」规则。 */
  instructions: string;
  /** 正文顺序；`custom` 时按 `spine`，否则按路径排序。 */
  order: ProjectOrder;
  /** 自定义顺序的正文列表；`order = natural` 时忽略。 */
  spine: string[];
  resources: ProjectResource[];
  /** 导出与检查跳过的前缀；目录以 `/` 结尾。 */
  exclude: string[];
  export: ProjectExportOptions;
}

/** 资料区约定目录。 */
export const MATERIAL_DIR = "资料";

const LIMITS = {
  title: 120,
  description: 500,
  role: 32,
  list: 1000,
};

/** 新建 / 转为项目时写入的规范骨架；只在文件不存在时写。 */
export const GUIDE_SKELETON = `# 写作规范

这里写项目背景、术语表、文体与禁止项。这份文件会进 AI 上下文，建议不超过 2000 字。

- 读者：
- 语气：
- 术语：
- 不要写：
`;

export type ParsedProject =
  | { ok: true; manifest: ProjectManifest }
  | { ok: false; reason: string };

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** 导出 / 检查的排除前缀；目录保留结尾 `/`。 */
function safeProjectPrefix(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().replace(/\\/g, "/");
  if (!trimmed) return null;
  const isDir = trimmed.endsWith("/");
  const core = safeRelativePath(trimmed.replace(/\/+$/, ""));
  if (!core) return null;
  return isDir ? `${core}/` : core;
}

function stringList(value: unknown, normalize: (entry: unknown) => string | null): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: string[] = [];
  for (const entry of value.slice(0, LIMITS.list)) {
    const next = normalize(entry);
    if (!next || seen.has(next)) continue;
    seen.add(next);
    list.push(next);
  }
  return list;
}

function normalizeResources(value: unknown): ProjectResource[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const list: ProjectResource[] = [];
  for (const entry of value.slice(0, LIMITS.list)) {
    if (!entry || typeof entry !== "object") continue;
    const input = entry as { path?: unknown; role?: unknown };
    const path = safeRelativePath(input.path);
    if (!path || seen.has(path)) continue;
    seen.add(path);
    list.push({ path, role: text(input.role, LIMITS.role) || "reference" });
  }
  return list;
}

/**
 * 解析清单。失败时返回原因，由调用方降级为隐式项目；
 * 不要在这里抛错——坏清单不能挡住打开文件。
 */
export function parseProject(raw: string, fallbackTitle: string): ParsedProject {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.replace(/^\uFEFF/, ""));
  } catch {
    return { ok: false, reason: "JSON 格式有误" };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, reason: "清单必须是一个 JSON 对象" };
  }

  const input = parsed as Record<string, unknown>;
  const version = typeof input.version === "number" ? input.version : PROJECT_VERSION;
  if (version > PROJECT_VERSION) {
    return { ok: false, reason: `由更新版本的 Writara 创建（version ${version}）` };
  }

  const kind = PROJECT_KINDS.some((entry) => entry.value === input.kind)
    ? (input.kind as ProjectKind)
    : "general";
  const exportOptions =
    input.export && typeof input.export === "object"
      ? (input.export as { toc?: unknown; chapterBreak?: unknown })
      : {};
  const spine = stringList(input.spine, safeRelativePath);
  // 旧清单没有 order：有 spine 视为自定义序，否则自然序。
  const order: ProjectOrder =
    input.order === "custom" || input.order === "natural"
      ? input.order
      : spine.length > 0
        ? "custom"
        : "natural";

  return {
    ok: true,
    manifest: {
      version: PROJECT_VERSION,
      title: text(input.title, LIMITS.title) || fallbackTitle || "未命名项目",
      kind,
      description: text(input.description, LIMITS.description),
      instructions: safeRelativePath(input.instructions) ?? "",
      order,
      spine,
      resources: normalizeResources(input.resources),
      exclude: stringList(input.exclude, safeProjectPrefix),
      export: {
        toc: exportOptions.toc === true,
        chapterBreak: exportOptions.chapterBreak !== false,
      },
    },
  };
}

/** 新建 / 转为项目时的默认清单。 */
export function createManifest(title: string, kind: ProjectKind): ProjectManifest {
  return {
    version: PROJECT_VERSION,
    title: title.trim().slice(0, LIMITS.title) || "未命名项目",
    kind,
    description: "",
    instructions: "",
    order: "natural",
    spine: [],
    resources: [],
    exclude: [],
    export: { toc: false, chapterBreak: true },
  };
}

/** 写回磁盘的稳定格式（字段顺序固定，未知字段不带出去）。 */
export function serializeProject(manifest: ProjectManifest): string {
  return `${JSON.stringify(
    {
      version: PROJECT_VERSION,
      title: manifest.title,
      kind: manifest.kind,
      description: manifest.description,
      instructions: manifest.instructions,
      order: manifest.order,
      spine: manifest.spine,
      resources: manifest.resources.map((entry) => ({ path: entry.path, role: entry.role })),
      exclude: manifest.exclude,
      export: { toc: manifest.export.toc, chapterBreak: manifest.export.chapterBreak },
    },
    null,
    2,
  )}\n`;
}
