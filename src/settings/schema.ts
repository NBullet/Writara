import { DOCX_TEMPLATES } from "../export/docx-templates";
import type { Settings } from "../storage/settings";

/**
 * 偏好设置的结构。
 *
 * 设置项写成数据，UI 只做通用渲染：新增字段只改这里 + `Settings`，
 * 顶部搜索、分类导航、以后「从命令面板跳到某一项」都是免费的。
 */

export type SectionId = "general" | "appearance" | "editor" | "images" | "markdown" | "ai" | "workspace" | "export";

export interface Choice {
  value: string;
  label: string;
}

export interface RangeControl {
  type: "range";
  min: number;
  max: number;
  step: number;
  unit?: string;
}

export interface ActionControl {
  type: "action";
  action: "import-css" | "clear-css" | "set-image-root" | "restore-draft";
  button: string;
}

export type Control =
  | { type: "toggle" }
  | { type: "select"; choices: Choice[] }
  | { type: "radio"; choices: Choice[] }
  /** 主题卡片：带纸面缩略图的单选，值必须是 StyleName。 */
  | { type: "style"; choices: Choice[] }
  | { type: "note"; text: string }
  | { type: "text"; placeholder?: string }
  /** 多行文本（每行一条的清单类设置，如自定义请求头）。 */
  | { type: "textarea"; placeholder?: string; rows?: number }
  /** 自己渲染的区块（agent 选择 / 规则与记忆），由 Preferences 认识 id。 */
  | { type: "custom"; id: "ai-agents" | "ai-context" | "ai-providers" }
  | { type: "spell" }
  | RangeControl
  | ActionControl;

export interface SettingRow {
  /** 绑定到哪个设置字段；动作行没有。 */
  field?: keyof Settings;
  label: string;
  hint?: string;
  keywords?: string[];
  /** 条件显示（例如「指定路径」只在选了自定义目录时出现）。 */
  showIf?: (settings: Settings) => boolean;
  control: Control;
}

export interface SettingGroup {
  title?: string;
  rows: SettingRow[];
}

export interface SettingSection {
  id: SectionId;
  title: string;
  groups: SettingGroup[];
}

export const SECTIONS: SettingSection[] = [
  {
    id: "general",
    title: "通用",
    groups: [
      {
        title: "启动",
        rows: [
          {
            field: "startup",
            label: "启动选项",
            keywords: ["启动", "会话", "session", "恢复"],
            control: {
              type: "select",
              choices: [
                { value: "session", label: "恢复上次会话" },
                { value: "new", label: "打开新文件" },
              ],
            },
          },
        ],
      },
      {
        title: "保存与恢复",
        rows: [
          {
            field: "autoSaveFile",
            label: "自动保存到文件",
            hint: "停笔约 1.5 秒写回原文件（需要已授权）",
            keywords: ["自动保存", "autosave"],
            control: { type: "toggle" },
          },
          {
            field: "saveBeforeSwitch",
            label: "切换文件前保存",
            hint: "关闭时改为询问，不会静默丢弃修改",
            keywords: ["切换", "保存", "switch"],
            control: { type: "toggle" },
          },
          {
            field: "autosaveDelay",
            label: "草稿保存延迟",
            hint: "只影响本地草稿，不影响写回文件",
            keywords: ["延迟", "草稿", "draft"],
            control: { type: "range", min: 200, max: 2000, step: 100, unit: "ms" },
          },
          {
            label: "未保存的草稿",
            hint: "把上次退出时残留的草稿载入编辑器",
            keywords: ["草稿", "恢复", "draft"],
            control: { type: "action", action: "restore-draft", button: "恢复" },
          },
        ],
      },
    ],
  },
  {
    id: "appearance",
    title: "外观",
    groups: [
      {
        title: "主题",
        rows: [
          {
            field: "theme",
            label: "明暗",
            keywords: ["主题", "dark", "light", "系统"],
            control: {
              type: "radio",
              choices: [
                { value: "system", label: "跟随系统" },
                { value: "light", label: "浅色" },
                { value: "dark", label: "深色" },
              ],
            },
          },
          {
            field: "style",
            label: "主题风格",
            keywords: ["主题", "style", "github", "night"],
            control: {
              type: "style",
              choices: [
                { value: "writara", label: "Writara" },
                { value: "github", label: "Github" },
                { value: "newsprint", label: "Newsprint" },
                { value: "night", label: "Night" },
                { value: "pixyll", label: "Pixyll" },
                { value: "whitey", label: "Whitey" },
              ],
            },
          },
        ],
      },
      {
        title: "排版",
        rows: [
          {
            field: "fontSize",
            label: "正文字号",
            keywords: ["字号", "font"],
            control: { type: "range", min: 13, max: 24, step: 1, unit: "px" },
          },
          {
            field: "measure",
            label: "正文栏宽",
            keywords: ["栏宽", "measure", "宽度"],
            control: { type: "range", min: 32, max: 64, step: 1, unit: "rem" },
          },
          {
            field: "readingWpm",
            label: "阅读速度",
            hint: "状态栏「约 N 分钟」按它估算",
            keywords: ["阅读", "速度", "reading"],
            control: { type: "range", min: 100, max: 1200, step: 20, unit: "字/分" },
          },
        ],
      },
      {
        title: "自定义样式",
        rows: [
          {
            label: "自定义 CSS",
            hint: "叠加在当前主题之上，并一起带进打印与导出的文件",
            keywords: ["css", "样式"],
            control: { type: "action", action: "import-css", button: "导入…" },
          },
          {
            label: "",
            control: { type: "action", action: "clear-css", button: "清除" },
          },
        ],
      },
    ],
  },
  {
    id: "editor",
    title: "编辑器",
    groups: [
      {
        title: "输入",
        rows: [
          {
            field: "spellcheck",
            label: "拼写检查",
            hint: "由系统词典提供，只影响编辑器",
            keywords: ["拼写", "spell", "检查"],
            control: { type: "toggle" },
          },
          {
            field: "smartPunctuation",
            label: "智能标点",
            hint: "输入时把直引号、省略号等替换成中文标点",
            keywords: ["标点", "引号", "punct"],
            control: { type: "toggle" },
          },
          {
            field: "defaultLineEnding",
            label: "默认换行符",
            hint: "新建文档使用；已有文件按文件本身保存",
            keywords: ["换行", "crlf", "lf", "line ending"],
            control: {
              type: "radio",
              choices: [
                { value: "lf", label: "LF（Unix）" },
                { value: "crlf", label: "CRLF（Windows）" },
              ],
            },
          },
        ],
      },
      {
        title: "代码块",
        rows: [
          {
            field: "codeLineNumbers",
            label: "显示行号",
            hint: "只在围栏代码块内显示，按块重新计数",
            keywords: ["行号", "line number"],
            control: { type: "toggle" },
          },
          {
            field: "codeIndent",
            label: "缩进宽度",
            hint: "Tab 与列表缩进使用的空格数",
            keywords: ["缩进", "indent", "tab"],
            control: {
              type: "radio",
              choices: [
                { value: "2", label: "2 空格" },
                { value: "4", label: "4 空格" },
              ],
            },
          },
        ],
      },
      {
        title: "拼写检查",
        rows: [
          {
            field: "spellLanguages",
            label: "检查语言",
            hint: "「自动」使用系统语言；由系统词典提供",
            keywords: ["拼写", "语言", "spell", "language"],
            control: { type: "spell" },
          },
        ],
      },
    ],
  },
  {
    id: "images",
    title: "图像",
    groups: [
      {
        title: "插入图片",
        rows: [
          {
            field: "imageAction",
            label: "插入图片时…",
            hint: "桌面端才会真正复制文件；Web 端一律内联 data URL",
            keywords: ["图片", "assets", "相对路径", "image", "复制"],
            control: {
              type: "select",
              choices: [
                { value: "assets", label: "复制到 ./${文档名}.assets 文件夹" },
                { value: "current", label: "复制到当前文件夹（./）" },
                { value: "path", label: "复制到指定路径…" },
                { value: "inline", label: "不复制（内联 data URL）" },
              ],
            },
          },
          {
            field: "imagePath",
            label: "指定路径",
            hint: "绝对路径，或相对文档目录的路径",
            keywords: ["图片", "路径", "path", "目录"],
            showIf: (settings) => settings.imageAction === "path",
            control: { type: "text", placeholder: "例如 assets/images" },
          },
          {
            field: "imageApplyLocal",
            label: "对本地图片应用上述规则",
            hint: "关掉后拖入 / 粘贴的图片一律内联",
            keywords: ["图片", "本地", "local"],
            control: { type: "toggle" },
          },
          {
            field: "imageRelative",
            label: "优先使用相对路径",
            hint: "关掉则写入绝对路径",
            keywords: ["图片", "相对", "relative"],
            control: { type: "toggle" },
          },
          {
            field: "imageEscape",
            label: "插入时自动转义图片 URL",
            hint: "空格、括号等按 URL 规则编码",
            keywords: ["图片", "转义", "escape", "url"],
            control: { type: "toggle" },
          },
          {
            label: "图片根目录",
            hint: "给「单独打开、没有磁盘路径」的文档解析相对路径图片用",
            keywords: ["图片", "目录", "根目录", "image"],
            control: { type: "action", action: "set-image-root", button: "选择…" },
          },
        ],
      },
    ],
  },
  {
    id: "markdown",
    title: "Markdown",
    groups: [
      {
        title: "扩展语法",
        rows: [
          {
            label: "公式 / 上下标 / 高亮 / 图表",
            control: {
              type: "note",
              text: "目前始终开启。按语法单独开关需要改解析器，等有实际需要再做。",
            },
          },
        ],
      },
      {
        title: "公式",
        rows: [
          {
            field: "mathNumbering",
            label: "自动编号",
            hint: "块级公式右侧显示 (1)(2)…；自己写了 \\tag 的公式保持原样",
            keywords: ["公式", "编号", "编号公式", "math", "number", "equation"],
            control: { type: "toggle" },
          },
        ],
      },
    ],
  },
  {
    id: "ai",
    title: "AI",
    groups: [
      {
        title: "模型接入",
        rows: [
          {
            label: "接入方式",
            control: {
              type: "note",
              text: "模型由机构配置，本工具不负责部署，也不保存任何端点或 Key：模型、端点与凭据都由 Agent 自己的配置负责（CLI 的配置文件 / 账号）。本工具只检测本机 CLI、记住每个 agent 的模型，并把模型暴露到对话下方的切换器。",
            },
          },
          {
            label: "执行 Agent",
            control: { type: "custom", id: "ai-agents" },
          },
          {
            label: "规则与记忆",
            control: { type: "custom", id: "ai-context" },
          },
        ],
      },
    ],
  },
  {
    id: "workspace",
    title: "工作区",
    groups: [
      {
        title: "扫描",
        rows: [
          {
            field: "scanDepth",
            label: "扫描深度",
            hint: "子目录最大层数",
            keywords: ["工作区", "深度", "扫描"],
            control: { type: "range", min: 1, max: 8, step: 1, unit: "层" },
          },
          {
            field: "scanFiles",
            label: "文件数上限",
            hint: "超过后停止扫描，避免大仓库卡住侧栏",
            keywords: ["工作区", "文件数", "上限"],
            control: { type: "range", min: 50, max: 2000, step: 50, unit: "个" },
          },
        ],
      },
    ],
  },
  {
    id: "export",
    title: "导出",
    groups: [
      {
        title: "打印与 PDF",
        rows: [
          {
            field: "paper",
            label: "纸张",
            keywords: ["纸张", "a4", "letter"],
            control: {
              type: "select",
              choices: [
                { value: "a4", label: "A4" },
                { value: "letter", label: "Letter" },
              ],
            },
          },
          {
            field: "margin",
            label: "页边距",
            keywords: ["页边距", "margin"],
            control: {
              type: "select",
              choices: [
                { value: "normal", label: "常规" },
                { value: "narrow", label: "窄" },
                { value: "wide", label: "宽" },
              ],
            },
          },
          {
            field: "pdfPageNumbers",
            label: "PDF 页码",
            hint: "在页脚显示「当前页 / 总页数」",
            keywords: ["页码", "pdf", "footer"],
            control: { type: "toggle" },
          },
          {
            field: "openExportFolder",
            label: "导出后打开所在文件夹",
            keywords: ["导出", "文件夹", "export"],
            control: { type: "toggle" },
          },
          {
            field: "pdfPageRanges",
            label: "页码范围",
            hint: "留空导出全部，例如 1-3,5",
            keywords: ["页码", "范围", "page range"],
            control: { type: "text", placeholder: "1-3,5" },
          },
          {
            field: "pdfAuthor",
            label: "PDF 作者",
            hint: "写进 PDF 元数据；标题取自文档标题",
            keywords: ["作者", "元数据", "author", "metadata"],
            control: { type: "text", placeholder: "署名" },
          },
          {
            field: "exportStyle",
            label: "导出主题",
            hint: "与编辑器当前主题分开选",
            keywords: ["导出", "主题", "theme"],
            control: {
              type: "select",
              choices: [
                { value: "current", label: "跟随当前主题" },
                { value: "writara", label: "Writara" },
                { value: "github", label: "Github" },
                { value: "newsprint", label: "Newsprint" },
                { value: "night", label: "Night" },
                { value: "pixyll", label: "Pixyll" },
                { value: "whitey", label: "Whitey" },
              ],
            },
          },
        ],
      },
      {
        title: "Word 与 ePub",
        rows: [
          {
            field: "pandocPath",
            label: "Pandoc 路径",
            hint: "导出 Word / ePub 用；留空自动探测（https://pandoc.org/installing.html）",
            keywords: ["pandoc", "docx", "word", "epub"],
            control: { type: "text", placeholder: "留空自动探测" },
          },
          {
            field: "docxTemplate",
            label: "Word 模板",
            hint: "字体、行距、表格与页边距来自模板；只影响 .docx",
            keywords: ["word", "docx", "模板", "字体", "行距", "页边距", "template"],
            control: {
              type: "select",
              choices: DOCX_TEMPLATES.map((template) => ({ value: template.id, label: template.label })),
            },
          },
          {
            field: "docxTemplatePath",
            label: "自定义模板路径",
            hint: "填自己的 .docx（Word 里改好样式后用「另存为模板」即可）；找不到时退回中文文稿",
            keywords: ["模板", "自定义", "docx", "reference"],
            showIf: (settings) => settings.docxTemplate === "custom",
            control: { type: "text", placeholder: "例如 D:\\模板\\报告.docx" },
          },
          {
            field: "docxToc",
            label: "生成目录",
            hint: "文中有 [TOC] 时也会生成；打开文档时 Word 会自动刷新目录",
            keywords: ["目录", "toc", "word"],
            control: { type: "toggle" },
          },
          {
            field: "docxNumberSections",
            label: "标题自动编号",
            hint: "按层级编号 1 / 1.1 / 1.1.1",
            keywords: ["编号", "章节", "number"],
            control: { type: "toggle" },
          },
          {
            field: "docxPageNumbers",
            label: "页脚页码",
            hint: "「第 X 页 / 共 Y 页」，居中",
            keywords: ["页码", "页脚", "footer", "word"],
            control: { type: "toggle" },
          },
        ],
      },
    ],
  },
];

/** 搜索：匹配标签、说明、关键词；空查询返回全部。`settings` 用于过滤条件可见的行。 */
export function matchRows(section: SettingSection, query: string, settings?: Settings): SettingGroup[] {
  const needle = query.trim().toLowerCase();
  const visible = (row: SettingRow) => !row.showIf || !settings || row.showIf(settings);

  return section.groups
    .map((group) => ({
      ...group,
      rows: group.rows.filter((row) => {
        if (!visible(row)) return false;
        if (!needle) return true;
        const haystack = [row.label, row.hint, ...(row.keywords ?? [])]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return haystack.includes(needle);
      }),
    }))
    .filter((group) => group.rows.length > 0);
}
