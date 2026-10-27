import {
  DEFAULT_DOCX_TEMPLATE,
  normalizeDocxTemplate,
  type DocxTemplateId,
} from "../export/docx-templates";

const KEY = "writara:settings";

export type ThemeMode = "system" | "light" | "dark";
export type StyleName = "writara" | "github" | "newsprint" | "night" | "pixyll" | "whitey";
/** 启动时打开新文件，还是恢复上次会话。 */
export type StartupMode = "new" | "session";

/**
 * AI 配置（对齐 Open Design：不内置模型提供方）。
 *
 * 模型提供方式完全由 agent 自己负责：Writara 只检测本机 coding-agent CLI、
 * 记住每个 agent 的模型，以及全局规则与长期记忆。没有任何端点/Key 需要在这里填。
 */

/** @deprecated 旧版字段；只在 normalize 时清空，保留类型避免旧数据报错。 */
export type AiProtocol = "openai" | "ollama";

/** @deprecated 旧版字段；不再使用。 */
export interface AiApiConfig {
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  headers: string;
}

/** @deprecated 旧版提供方列表；不再使用。 */
export interface AiProvider {
  id: string;
  name: string;
  protocol: AiProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  headers: string;
}

/** 长期记忆条目（事实 / 偏好）。 */
export interface AiMemoryItem {
  id: string;
  text: string;
  createdAt: number;
}

import type { MarginPreset, PaperSize } from "../export/page";
import type { LineEnding } from "../io/line-endings";

export interface Settings {
  theme: ThemeMode;
  style: StyleName;
  /** 正文字号，px。 */
  fontSize: number;
  /** 正文栏宽，rem。 */
  measure: number;
  /** 草稿自动保存延迟，ms。 */
  autosaveDelay: number;
  paper: PaperSize;
  margin: MarginPreset;
  /** 导出 PDF 时在页脚显示「当前页 / 总页数」。 */
  pdfPageNumbers: boolean;
  /** 导出后自动在文件管理器里定位。 */
  openExportFolder: boolean;
  /** 启动行为。 */
  startup: StartupMode;
  /** 打开另一个文件前先保存当前修改（关掉时会先询问）。 */
  saveBeforeSwitch: boolean;
  /** 阅读速度，字/分钟，用于状态栏的「约 N 分钟」。 */
  readingWpm: number;
  /** 拖入 / 粘贴图片的处理方式。 */
  imageAction: "inline" | "assets" | "current" | "path";
  /** `imageAction === "path"` 时的目标目录（绝对路径，或相对文档目录）。 */
  imagePath: string;
  /** 对本地图片应用上述规则；关掉则一律内联 data URL。 */
  imageApplyLocal: boolean;
  /** 插入相对路径而不是绝对路径。 */
  imageRelative: boolean;
  /** 插入时对 URL 做转义（空格等）。 */
  imageEscape: boolean;
  /** 默认换行符。 */
  defaultLineEnding: LineEnding;
  /** 工作区扫描深度（层）。 */
  scanDepth: number;
  /** 工作区扫描文件数上限。 */
  scanFiles: number;
  /** 代码块显示行号。 */
  codeLineNumbers: boolean;
  /** 代码 / 列表缩进宽度。 */
  codeIndent: number;
  /** PDF 页码范围，例如 `1-3,5`。 */
  pdfPageRanges: string;
  /** 导出 PDF 时写入的作者。 */
  pdfAuthor: string;
  /** 导出使用的主题；`current` 表示跟随当前主题。 */
  exportStyle: StyleName | "current";
  /** Pandoc 可执行文件路径；留空则自动探测。 */
  pandocPath: string;
  /** Word 导出使用的参考模板。 */
  docxTemplate: DocxTemplateId;
  /** `docxTemplate === "custom"` 时的 .docx 绝对路径。 */
  docxTemplatePath: string;
  /** Word 导出时生成目录（`[TOC]` 也会触发）。 */
  docxToc: boolean;
  /** Word 导出时给标题自动编号。 */
  docxNumberSections: boolean;
  /** Word 导出时在页脚显示页码。 */
  docxPageNumbers: boolean;
  /** 拼写检查语言（BCP-47）；空数组表示跟随系统。 */
  spellLanguages: string[];
  spellcheck: boolean;
  smartPunctuation: boolean;
  /** 块级公式自动编号（Typora 的「数学公式自动编号」）。 */
  mathNumbering: boolean;
  /** 停笔后自动写回文件（需要已获得写权限，不会弹权限框）。 */
  autoSaveFile: boolean;
  /** 用户导入的自定义 CSS，叠加在当前主题之上。 */
  customCss: string;
  /** 当前执行 agent：`cli:<id>`。空表示还没选；不再有内置 API。 */
  aiAgentId: string;
  /** 每个 agent 的模型（键为 CLI id；Open Design 的 agentModels）。 */
  aiAgentModels: Record<string, string>;
  /** 全局规则：每次 AI 请求都附加的固定指令（Open Design 的「指令与规则」）。 */
  aiGlobalRules: string;
  /** 长期记忆：事实 / 偏好，跨会话注入。 */
  aiMemory: AiMemoryItem[];
  /** 记忆总开关。 */
  aiMemoryEnabled: boolean;
  /** @deprecated 旧版字段；不再使用。 */
  aiApi: AiApiConfig;
  /** @deprecated 旧版提供方列表；不再使用。 */
  aiProviders: AiProvider[];
  /** @deprecated 见 `aiProviders`。 */
  aiActiveId: string;
  /** @deprecated 见 `aiProviders`。 */
  aiActiveModel: string;
  /** @deprecated 旧版单端点配置；仅在迁移时读取，保存后清空。 */
  aiEndpoint: string;
  /** @deprecated 见 `aiEndpoint`。 */
  aiModel: string;
  /** @deprecated 见 `aiEndpoint`。 */
  aiKey: string;
  /** @deprecated 见 `aiEndpoint`。 */
  aiHeaders: string;
}

/** 自定义 CSS 最多保留这么多字符，避免 localStorage 被写爆。 */
export const CUSTOM_CSS_LIMIT = 200_000;

/**
 * 自定义 CSS 会进 <style>，所以去掉 @import（避免加载远程样式）
 * 和 </style（避免提前闭合标签）。
 */
export function sanitizeCustomCss(css: string): string {
  return css
    .replace(/@import[\s\S]*?;/gi, "")
    .replace(/<\/style/gi, "")
    .slice(0, CUSTOM_CSS_LIMIT);
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  style: "writara",
  fontSize: 17,
  measure: 42,
  autosaveDelay: 400,
  paper: "a4",
  margin: "normal",
  pdfPageNumbers: true,
  openExportFolder: false,
  startup: "session",
  saveBeforeSwitch: true,
  readingWpm: 400,
  imageAction: "assets",
  imagePath: "",
  imageApplyLocal: true,
  imageRelative: true,
  imageEscape: false,
  scanDepth: 4,
  scanFiles: 300,
  codeLineNumbers: false,
  codeIndent: 2,
  pdfPageRanges: "",
  pdfAuthor: "",
  exportStyle: "current",
  pandocPath: "",
  docxTemplate: DEFAULT_DOCX_TEMPLATE,
  docxTemplatePath: "",
  docxToc: false,
  docxNumberSections: false,
  docxPageNumbers: true,
  spellLanguages: [],
  defaultLineEnding: "lf",
  spellcheck: true,
  smartPunctuation: false,
  mathNumbering: false,
  autoSaveFile: true,
  customCss: "",
  aiAgentId: "",
  aiAgentModels: {},
  aiGlobalRules: "",
  aiMemory: [],
  aiMemoryEnabled: true,
  aiApi: { protocol: "openai", baseUrl: "", apiKey: "", headers: "" },
  aiProviders: [],
  aiActiveId: "",
  aiActiveModel: "",
  aiEndpoint: "",
  aiModel: "",
  aiKey: "",
  aiHeaders: "",
};

export const STYLES: Array<{ value: StyleName; label: string }> = [
  { value: "writara", label: "Writara" },
  { value: "github", label: "Github" },
  { value: "newsprint", label: "Newsprint" },
  { value: "night", label: "Night" },
  { value: "pixyll", label: "Pixyll" },
  { value: "whitey", label: "Whitey" },
];

export const LIMITS = {
  fontSize: { min: 13, max: 24 },
  measure: { min: 32, max: 64 },
  autosaveDelay: { min: 200, max: 3000 },
} as const;

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

const MAX_PROVIDERS = 8;

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

/** 提供方列表落盘前的收敛：去空、去重、截断。 */
export function normalizeProviders(raw: unknown): AiProvider[] {
  if (!Array.isArray(raw)) return [];
  const out: AiProvider[] = [];
  const seen = new Set<string>();
  for (const entry of raw.slice(0, MAX_PROVIDERS)) {
    if (!entry || typeof entry !== "object") continue;
    const input = entry as Partial<AiProvider>;
    const id = text(input.id, 64) || `p${out.length + 1}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name: text(input.name, 80) || `提供方 ${out.length + 1}`,
      protocol: input.protocol === "ollama" ? "ollama" : "openai",
      baseUrl: text(input.baseUrl, 500),
      model: text(input.model, 200),
      apiKey: text(input.apiKey, 500),
      headers: typeof input.headers === "string" ? input.headers.slice(0, 2000) : "",
    });
  }
  return out;
}

function normalizeAgentModels(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw).slice(0, 16)) {
    const id = text(key, 64);
    const model = text(value, 200);
    if (id && model) out[id] = model;
  }
  return out;
}

/** 把任意来源的设置收敛到合法范围，避免坏值写进 CSS。 */
export function normalizeSettings(input: Partial<Settings> | null | undefined): Settings {
  // 旧版端点 / 提供方字段不再使用：清空，避免旧配置影响新流程。
  const aiAgentId = text(input?.aiAgentId, 80);
  const aiAgentModels = normalizeAgentModels(input?.aiAgentModels);

  const aiMemory: AiMemoryItem[] = Array.isArray(input?.aiMemory)
    ? input.aiMemory
        .slice(0, 100)
        .map((entry, index) => {
          const item = (entry ?? {}) as Partial<AiMemoryItem>;
          return {
            id: text(item.id, 64) || `m${index + 1}`,
            text: text(item.text, 500),
            createdAt: typeof item.createdAt === "number" ? item.createdAt : 0,
          };
        })
        .filter((entry) => entry.text.length > 0)
    : [];

  return {
    theme:
      input?.theme === "light" || input?.theme === "dark" || input?.theme === "system"
        ? input.theme
        : DEFAULT_SETTINGS.theme,
    fontSize: clamp(input?.fontSize, DEFAULT_SETTINGS.fontSize, LIMITS.fontSize.min, LIMITS.fontSize.max),
    measure: clamp(input?.measure, DEFAULT_SETTINGS.measure, LIMITS.measure.min, LIMITS.measure.max),
    autosaveDelay: clamp(
      input?.autosaveDelay,
      DEFAULT_SETTINGS.autosaveDelay,
      LIMITS.autosaveDelay.min,
      LIMITS.autosaveDelay.max,
    ),
    paper: input?.paper === "letter" ? "letter" : "a4",
    margin:
      input?.margin === "narrow" || input?.margin === "wide" || input?.margin === "normal"
        ? input.margin
        : "normal",
    style: STYLES.some((style) => style.value === input?.style) ? input!.style! : "writara",
    pdfPageNumbers: input?.pdfPageNumbers !== false,
    openExportFolder: input?.openExportFolder === true,
    startup: input?.startup === "new" ? "new" : "session",
    saveBeforeSwitch: input?.saveBeforeSwitch !== false,
    readingWpm: clamp(input?.readingWpm, DEFAULT_SETTINGS.readingWpm, 100, 1200),
    imageAction:
      input?.imageAction === "inline" ||
      input?.imageAction === "current" ||
      input?.imageAction === "path" ||
      input?.imageAction === "assets"
        ? input.imageAction
        : "assets",
    imagePath: typeof input?.imagePath === "string" ? input.imagePath.trim().slice(0, 500) : "",
    imageApplyLocal: input?.imageApplyLocal !== false,
    imageRelative: input?.imageRelative !== false,
    imageEscape: input?.imageEscape === true,
    scanDepth: clamp(input?.scanDepth, DEFAULT_SETTINGS.scanDepth, 1, 8),
    scanFiles: clamp(input?.scanFiles, DEFAULT_SETTINGS.scanFiles, 50, 2000),
    codeLineNumbers: input?.codeLineNumbers === true,
    codeIndent: input?.codeIndent === 4 ? 4 : 2,
    pdfPageRanges: typeof input?.pdfPageRanges === "string" ? input.pdfPageRanges.trim().slice(0, 120) : "",
    pdfAuthor: typeof input?.pdfAuthor === "string" ? input.pdfAuthor.trim().slice(0, 120) : "",
    exportStyle:
      input?.exportStyle && ["current", ...STYLES.map((style) => style.value)].includes(input.exportStyle)
        ? input.exportStyle
        : "current",
    pandocPath: typeof input?.pandocPath === "string" ? input.pandocPath.trim().slice(0, 500) : "",
    docxTemplate: normalizeDocxTemplate(input?.docxTemplate),
    docxTemplatePath:
      typeof input?.docxTemplatePath === "string" ? input.docxTemplatePath.trim().slice(0, 500) : "",
    docxToc: input?.docxToc === true,
    docxNumberSections: input?.docxNumberSections === true,
    docxPageNumbers: input?.docxPageNumbers !== false,
    spellLanguages: Array.isArray(input?.spellLanguages)
      ? input.spellLanguages.filter((code): code is string => typeof code === "string").slice(0, 8)
      : [],
    defaultLineEnding: input?.defaultLineEnding === "crlf" ? "crlf" : "lf",
    spellcheck: input?.spellcheck !== false,
    smartPunctuation: input?.smartPunctuation === true,
    mathNumbering: input?.mathNumbering === true,
    autoSaveFile: input?.autoSaveFile !== false,
    customCss: typeof input?.customCss === "string" ? sanitizeCustomCss(input.customCss) : "",
    aiApi: { protocol: "openai", baseUrl: "", apiKey: "", headers: "" },
    aiAgentId,
    aiAgentModels,
    aiGlobalRules: typeof input?.aiGlobalRules === "string" ? input.aiGlobalRules.slice(0, 4000) : "",
    aiMemory,
    aiMemoryEnabled: input?.aiMemoryEnabled !== false,
    aiProviders: [],
    aiActiveId: "",
    aiActiveModel: "",
    aiEndpoint: "",
    aiModel: "",
    aiKey: "",
    aiHeaders: "",
  };
}

export function loadSettings(): Settings {
  // 桌面端优先读 userData/app-state.json（可备份、不会被 webview 清理带走）。
  const native = readNativeSettings();
  if (native) return normalizeSettings(native);

  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const settings = normalizeSettings(JSON.parse(raw) as Partial<Settings>);
    // 首次迁移：把 localStorage 里的旧设置写进原生存储。
    void window.writara?.store?.write({ settings });
    return settings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function readNativeSettings(): Partial<Settings> | null {
  try {
    const state = window.writara?.store?.read?.();
    if (!state || typeof state !== "object") return null;
    const settings = (state as Record<string, unknown>).settings;
    return settings && typeof settings === "object" ? (settings as Partial<Settings>) : null;
  } catch {
    return null;
  }
}

/**
 * 最近一次应用的设置快照。
 *
 * 编辑器里的装饰（公式编号等）每次按键都会重建，不能在那里直接调 `loadSettings()`
 * ——它要读原生存储 / localStorage。App 每次改设置都会走 `applySettings()` / `saveSettings()`，
 * 缓存跟着更新即可。
 */
let cached: Settings | null = null;

export function currentSettings(): Settings {
  if (!cached) cached = loadSettings();
  return cached;
}

export function saveSettings(settings: Settings): void {
  cached = settings;
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // 隐私模式下写不进去，界面照常可用。
  }
  void window.writara?.store?.write({ settings });
}

/** 写到 <html> 上，CSS 变量与主题选择都从这里生效。 */
export function applySettings(settings: Settings, root: HTMLElement = document.documentElement): void {
  cached = settings;
  root.dataset.theme = settings.theme;
  root.dataset.style = settings.style;
  root.style.setProperty("--wr-font-size", `${settings.fontSize}px`);
  root.style.setProperty("--wr-measure", `${settings.measure}rem`);
  applyCustomCss(settings.customCss);
}

const CUSTOM_CSS_ID = "wr-custom-css";

/** 把自定义 CSS 挂到 head（幂等）；为空时移除。 */
export function applyCustomCss(css: string): void {
  if (typeof document === "undefined") return;
  const existing = document.getElementById(CUSTOM_CSS_ID) as HTMLStyleElement | null;
  const cleaned = sanitizeCustomCss(css ?? "");
  if (!cleaned.trim()) {
    existing?.remove();
    return;
  }
  const style = existing ?? document.createElement("style");
  style.id = CUSTOM_CSS_ID;
  // textContent 不会解析 HTML，但先清洗一遍，导出时还要拼进 <style>。
  style.textContent = cleaned;
  if (!existing) document.head.appendChild(style);
}
