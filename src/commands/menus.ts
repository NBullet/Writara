import type { LineEnding } from "../io/line-endings";
import type { StyleName } from "../storage/settings";
import type { Menu, MenuItem } from "./menu";

/**
 * 菜单结构（与 Typora 的分组对齐）。
 * 这里只放 id / 文案 / 快捷键，具体行为由 App 的 runCommand 分发。
 */

export interface MenuState {
  sidebarVisible: boolean;
  sidebarMode: "outline" | "tree";
  sourceMode: boolean;
  focusMode: boolean;
  typewriterMode: boolean;
  statusBar: boolean;
  style: StyleName;
  lineEnding: LineEnding;
  /** 当前文件已经是 UTF-8（无 BOM）时，「以 UTF-8 重新保存」没有意义。 */
  utf8: boolean;
  spellcheck: boolean;
  smartPunctuation: boolean;
  hasCustomCss: boolean;
  recent: string[];
  recentFolders: string[];
  /**
   * 与 `recent` / `recentFolders` 等长的命令 id。
   * 桌面端用 `recent-file:<路径>`，多窗口时不会因为两个窗口的列表顺序不同而错位；
   * 没有提供时退回 `recent-<index>`（浏览器端）。
   */
  recentIds?: string[];
  recentFolderIds?: string[];
  /** 是否检测到 Pandoc（决定 Word / ePub 导出项是否可用）。 */
  pandocAvailable: boolean;
  /** 桌面端才有的在线更新；Web 版不显示这一项。 */
  updates?: boolean;
  /** 当前工作区是否项目（有指令文件或清单）。 */
  isProject?: boolean;
  /** 右侧 AI 对话是否展开（菜单显示勾选状态）。 */
  chatOpen?: boolean;
  /** 「从模板新建」的条目；旧状态没带这个字段时按空数组处理。 */
  templates?: Array<{ id: string; label: string }>;
}

const item = (id: string, label: string, combo?: string, checked?: boolean): MenuItem => ({
  type: "item",
  id,
  label,
  shortcut: combo,
  checked,
});

const separator: MenuItem = { type: "separator" };

const EMOJI: Array<{ id: string; label: string; char: string }> = [
  { id: "emoji-smile", label: "😄 微笑", char: "😄" },
  { id: "emoji-thumbsup", label: "👍 赞", char: "👍" },
  { id: "emoji-tada", label: "🎉 庆祝", char: "🎉" },
  { id: "emoji-check", label: "✅ 完成", char: "✅" },
  { id: "emoji-heart", label: "❤️ 喜欢", char: "❤️" },
  { id: "emoji-fire", label: "🔥 火", char: "🔥" },
  { id: "emoji-rocket", label: "🚀 火箭", char: "🚀" },
  { id: "emoji-bulb", label: "💡 想法", char: "💡" },
  { id: "emoji-warning", label: "⚠️ 注意", char: "⚠️" },
  { id: "emoji-memo", label: "📝 记录", char: "📝" },
];

export { EMOJI };

const STYLE_ITEMS: Array<{ id: string; label: string; style: StyleName }> = [
  { id: "style-writara", label: "Writara", style: "writara" },
  { id: "style-github", label: "Github", style: "github" },
  { id: "style-newsprint", label: "Newsprint", style: "newsprint" },
  { id: "style-night", label: "Night", style: "night" },
  { id: "style-pixyll", label: "Pixyll", style: "pixyll" },
  { id: "style-whitey", label: "Whitey", style: "whitey" },
];

export function createMenus(state: MenuState): Menu[] {
  const recent = state.recent ?? [];
  const recentFolders = state.recentFolders ?? [];
  const recentIds = state.recentIds ?? [];
  const recentFolderIds = state.recentFolderIds ?? [];
  // HMR / 旧状态可能没带 templates 字段，全部按空处理
  const templates = state.templates ?? [];
  const templateItems: MenuItem[] =
    templates.length === 0
      ? [{ type: "item", id: "from-template-none", label: "（没有可用模板）", disabled: true }]
      : templates.map((entry) => item(`from-template-${entry.id}`, entry.label));
  return [
    {
      id: "file",
      label: "文件",
      items: [
        item("new", "新建", "Mod+n"),
        item("new-window", "新建窗口", "Mod+Shift+n"),
        {
          type: "submenu",
          id: "from-template",
          label: "从模板新建",
          items: templateItems,
        },
        item("open", "打开…", "Mod+o"),
        item("open-folder", "打开文件夹…"),
        item("new-project", "新建项目…"),
        {
          type: "submenu",
          id: "recent-folders",
          label: "打开最近文件夹",
          items:
            recentFolders.length === 0
              ? [{ type: "item", id: "recent-folder-none", label: "（没有最近文件夹）", disabled: true }]
              : [
                  ...recentFolders.map((name, index) =>
                    item(recentFolderIds[index] ?? `recent-folder-${index}`, name),
                  ),
                  separator,
                  item("recent-folder-clear", "清除最近文件夹"),
                ],
        },
        item("set-image-root", "设置图片根目录…"),
        {
          type: "submenu",
          id: "recent",
          label: "打开最近",
          items:
            recent.length === 0
              ? [{ type: "item", id: "recent-none", label: "（没有最近文件）", disabled: true }]
              : [
                  ...recent.map((name, index) => item(recentIds[index] ?? `recent-${index}`, name)),
                  separator,
                  item("recent-clear", "清除最近记录"),
                ],
        },
        separator,
        item("save", "保存", "Mod+s"),
        item("save-as", "另存为…", "Mod+Shift+s"),
        item("reveal", "在文件夹中显示"),
        item("copy-path", "复制文件路径"),
        {
          type: "item",
          id: "convert-utf8",
          label: "以 UTF-8 重新保存",
          disabled: state.utf8,
        },
        separator,
        item("export-html", "导出 HTML…"),
        item("export-pdf", "导出 PDF…"),
        item("export-png", "导出图片 (PNG)…"),
        {
          type: "item",
          id: "export-project-single",
          label: "导出项目（合并 PDF）…",
          disabled: !state.isProject,
        },
        {
          type: "item",
          id: "export-project-bundle",
          label: "导出项目（分章 HTML）…",
          disabled: !state.isProject,
        },
        {
          type: "item",
          id: "project-ai",
          label: "项目 AI 任务…",
          disabled: !state.isProject,
        },
        {
          type: "item",
          id: "export-docx",
          label: "导出 Word (.docx)…",
          disabled: !state.pandocAvailable,
        },
        {
          type: "item",
          id: "export-epub",
          label: "导出 ePub…",
          disabled: !state.pandocAvailable,
        },
        item("print", "打印预览 / 另存为 PDF", "Mod+Shift+p"),
        separator,
        item("settings", "偏好设置…", "Mod+Comma"),
      ],
    },
    {
      id: "edit",
      label: "编辑",
      items: [
        item("undo", "撤销", "Mod+z"),
        item("redo", "重做", "Mod+y"),
        separator,
        item("cut", "剪切", "Mod+x"),
        item("copy", "复制", "Mod+c"),
        item("paste", "粘贴", "Mod+v"),
        separator,
        item("copy-plain", "复制为纯文本"),
        item("copy-markdown", "复制为 Markdown", "Mod+Shift+c"),
        item("copy-html", "复制为 HTML 代码"),
        item("copy-simple", "复制内容（简化格式）"),
        separator,
        item("paste-plain", "粘贴为纯文本", "Mod+Shift+v"),
        separator,
        {
          type: "submenu",
          id: "select",
          label: "选择",
          items: [
            item("select-all", "全选", "Mod+a"),
            item("select-line", "选择行"),
            item("select-block", "选择段落"),
            separator,
            item("select-next-occurrence", "选择下一个相同文本", "Mod+d"),
            item("select-all-occurrences", "选择全部相同文本", "Mod+Shift+d"),
          ],
        },
        {
          type: "submenu",
          id: "delete",
          label: "删除",
          items: [
            item("delete-selection", "删除范围"),
            item("delete-line", "删除行"),
            item("delete-block", "删除段落"),
          ],
        },
        {
          type: "submenu",
          id: "math",
          label: "数学工具",
          items: [item("math-inline", "行内公式"), item("math-block", "公式块", "Mod+Shift+m")],
        },
        {
          type: "submenu",
          id: "smart",
          label: "智能标点",
          items: [
            item("smart-on", "开启", undefined, state.smartPunctuation),
            item("smart-off", "关闭", undefined, !state.smartPunctuation),
          ],
        },
        {
          type: "submenu",
          id: "line-ending",
          label: "换行符",
          items: [
            item("line-ending-lf", "Unix (LF)", undefined, state.lineEnding === "lf"),
            item("line-ending-crlf", "Windows (CRLF)", undefined, state.lineEnding === "crlf"),
          ],
        },
        separator,
        item("find", "查找和替换", "Mod+f"),
        item("spellcheck", "拼写检查", undefined, state.spellcheck),
        {
          type: "submenu",
          id: "emoji",
          label: "表情与符号",
          items: EMOJI.map((emoji) => item(emoji.id, emoji.label)),
        },
      ],
    },
    {
      id: "paragraph",
      label: "段落",
      items: [
        item("heading-1", "一级标题", "Mod+Digit1"),
        item("heading-2", "二级标题", "Mod+Digit2"),
        item("heading-3", "三级标题", "Mod+Digit3"),
        item("heading-4", "四级标题", "Mod+Digit4"),
        item("heading-5", "五级标题", "Mod+Digit5"),
        item("heading-6", "六级标题", "Mod+Digit6"),
        item("heading-0", "段落", "Mod+Digit0"),
        separator,
        item("heading-promote", "提升标题级别", "Mod+Equal"),
        item("heading-demote", "降低标题级别", "Mod+Minus"),
        separator,
        {
          type: "submenu",
          id: "table",
          label: "表格",
          items: [
            item("table-insert", "插入表格…"),
            separator,
            item("table-row-above", "在上方插入行"),
            item("table-row-below", "在下方插入行"),
            item("table-row-delete", "删除行"),
            separator,
            item("table-col-left", "在左侧插入列"),
            item("table-col-right", "在右侧插入列"),
            item("table-col-delete", "删除列"),
            separator,
            item("table-align-left", "左对齐"),
            item("table-align-center", "居中对齐"),
            item("table-align-right", "右对齐"),
          ],
        },
        item("code-block", "代码块", "Mod+Shift+k"),
        item("math-block", "公式块", "Mod+Shift+m"),
        item("quote", "引用", "Mod+Shift+q"),
        separator,
        item("list-ordered", "有序列表", "Mod+Shift+BracketLeft"),
        item("list-bullet", "无序列表", "Mod+Shift+BracketRight"),
        item("list-task", "任务列表"),
        {
          type: "submenu",
          id: "task-state",
          label: "任务状态",
          items: [item("task-done", "标记为完成"), item("task-todo", "标记为未完成")],
        },
        {
          type: "submenu",
          id: "indent",
          label: "列表缩进",
          items: [item("indent-in", "增加缩进"), item("indent-out", "减少缩进")],
        },
        separator,
        item("para-above", "在上方插入段落"),
        item("para-below", "在下方插入段落"),
        separator,
        item("link-ref", "链接引用"),
        item("footnote", "脚注"),
        separator,
        item("hr", "水平分割线"),
        item("toc", "内容目录"),
        item("front-matter", "YAML Front Matter"),
      ],
    },
    {
      id: "format",
      label: "格式",
      items: [
        item("bold", "加粗", "Mod+b"),
        item("italic", "斜体", "Mod+i"),
        item("underline", "下划线", "Mod+u"),
        item("code", "代码", "Mod+Shift+Backquote"),
        item("strike", "删除线", "Alt+Shift+Digit5"),
        item("comment", "注释"),
        separator,
        item("link", "超链接", "Mod+k"),
        item("image", "插入图片…"),
        item("attachment", "插入附件…"),
        separator,
        item("clear-format", "清除样式", "Mod+Backslash"),
      ],
    },
    {
      id: "ai",
      label: "AI",
      items: [
        item("chat-toggle", "AI 对话（右侧）", undefined, state.chatOpen === true),
        separator,
        item("ai-draft", "AI 初稿…"),
        item("brief-draft", "AI 初稿（任务单）…"),
        item("ai-draft-outline", "AI 初稿（按当前标题）"),
        item("ai-continue", "续写"),
        separator,
        item("ai-polish", "润色（选区 / 当段）"),
        item("ai-expand", "扩写"),
        item("ai-shorten", "缩写"),
        item("ai-deslop", "去 AI 腔（模型）"),
        item("ai-table", "生成表格"),
        item("ai-chart", "生成图表"),
        item("ai-formula", "生成公式"),
        separator,
        item("ai-review", "审稿意见（全文）"),
        item("ai-proofread", "全文校对"),
        item("ai-antislop-rules", "检查 AI 腔（标记，全篇）"),
        item("ai-antislop-apply", "清理 AI 腔（全篇）"),
        item("ai-antislop-clear", "清除 AI 腔标记"),
        separator,
        item("check-document", "文档体检…"),
        item("check-fix-all", "修复标点与格式问题"),
        separator,
        item("proposals-open", "待审提案…"),
      ],
    },
    {
      id: "view",
      label: "视图",
      items: [
        item("palette", "命令面板…", "Mod+p"),
        separator,
        item("toggle-sidebar", "显示/隐藏侧边栏", "Mod+Shift+l", state.sidebarVisible),
        separator,
        item("sidebar-outline", "大纲", "Mod+Shift+Digit1", state.sidebarMode === "outline"),
        item("sidebar-tree", "文件树", "Mod+Shift+Digit3", state.sidebarMode === "tree"),
        item("search", "搜索", "Mod+Shift+f"),
        separator,
        item("source-mode", "源代码模式", "Mod+Slash", state.sourceMode),
        item("focus-mode", "专注模式", "F8", state.focusMode),
        item("typewriter-mode", "打字机模式", "F9", state.typewriterMode),
        separator,
        item("status-bar", "显示状态栏", undefined, state.statusBar),
        item("fullscreen", "切换全屏", "F11"),
        separator,
        item("zoom-reset", "实际大小", "Mod+Shift+Digit9"),
        item("zoom-in", "放大", "Mod+Shift+Equal"),
        item("zoom-out", "缩小", "Mod+Shift+Minus"),
      ],
    },
    {
      id: "theme",
      label: "主题",
      items: [
        ...STYLE_ITEMS.map((entry) => item(entry.id, entry.label, undefined, state.style === entry.style)),
        separator,
        item("custom-css-import", "导入自定义 CSS…"),
        ...(state.hasCustomCss ? [item("custom-css-clear", "清除自定义 CSS")] : []),
      ],
    },
    {
      id: "help",
      label: "帮助",
      items: [
        item("help-shortcuts", "键盘快捷键"),
        item("help-about", "关于 Writara"),
        ...(state.updates === false ? [] : [item("check-update", "检查更新…")]),
        separator,
        item("help-markdown", "Markdown 参考"),
      ],
    },
  ];
}
