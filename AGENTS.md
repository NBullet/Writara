# AGENTS.md

**Writara｜文叙** — Typora 式 Markdown 编辑器，纯 Web / PWA 优先（尚未套桌面壳）。
核心是「源码与渲染同层」：CodeMirror 6 自绘即时渲染，**不是**富文本 WYSIWYG。
Slogan：Write naturally, render instantly. 自然书写，即刻呈现。

能力对齐清单与已知差距见 `docs/typora-parity.md`（改功能前先看它，避免重复或跑偏）。
分块编辑态（哪种块聚焦时给什么视图）的调研与落地见 `docs/focus-views.md`。
项目模式（指令文件 + 资源树 + 清单）的定稿与实现状态见 `docs/project-mode.md`；
身份、资源文件树、顺序、双导出、多文件 diff 已实现，剩余切片见该文末。

两条渲染管线必须一起改：

1. **编辑器**：语法树 → `LiveEdit` → CodeMirror 装饰（视口内）。
2. **打印 / 导出**：语法树 → 静态 HTML → 打印区或单文件 HTML（全文）。

## 命令

| 目的 | 命令 |
| --- | --- |
| 开发服务器 | `npm run dev`（默认 5173） |
| 桌面端开发 | `npm run dev:electron`（先编主进程，再起 Vite + Electron） |
| 桌面端构建 | `npm run build:electron`（`dist/` + `dist-electron/`） |
| 打安装包 | `npm run package`（electron-builder，当前未签名） |
| 打印预览 | `http://localhost:5173/?print=1`（A4 版面，与导出一致） |
| 重新生成 Word 模板 | `npm run templates:docx`（写 `resources/templates/*.docx`） |
| 发布到 GitHub Releases | `npm run release`（需要 `GH_TOKEN`；生成草稿 release，需在 GitHub 上手动发布） |
| 构建 | `npm run build` → `dist/`（含 PWA 产物） |
| 类型检查 | `npm run typecheck` |
| Lint | `npm run lint` |
| 全部测试 | `npm test` |
| 单文件测试 | `npx vitest run src/markdown/render.test.ts` |
| 单用例测试 | `npx vitest run -t "标题按层级"` |

收尾按 `npm run lint && npm run typecheck && npm test`；`build` 已串联 typecheck。
`vite build` 的 500 kB chunk 警告属正常（CM6 + React），不是回归。

## 架构

- `src/editor/live-preview/analyze.ts` — 编辑器渲染规则的唯一入口。纯函数
  `collectEdits(doc, tree, selection, visibleRanges)` 返回 `hide | mark | line | task`，不碰 DOM。
- `src/editor/live-preview/focus.ts` — 焦点判定的唯一入口，只有两级：
  `spanTouched`（行内元素，含边界——原子 widget 只能落在边界上）与 `blockTouched`（块级标记）。
  不要在块文件里再写一份 `overlapsSelection`。
- `src/editor/live-preview/index.ts` — `ViewPlugin`，把 `LiveEdit` 翻译成装饰。
  重建条件是 `docChanged / selectionSet / viewportChanged / 语法树对象变化`；最后一条必须有：
  解析是增量的，解析推进时 CodeMirror 会 dispatch 一个没有 doc/selection 变化的更新。
- `src/editor/live-preview/svg-blocks.ts` — `<svg>` 独立块 → 块级 widget（`StateField`）。
- `src/editor/live-preview/table-blocks.ts` — 表格 → 真实表格。表格**常驻渲染态**，单元格编辑走
  叠在单元格上的输入框（`table-focus.ts` 记住当前格）；结构命令复用 `markdown/table-edit.ts`。
  只有程序化把选区送进表内（搜索跳转、逐字选择）时才退回源码——块级 replace 里放不下光标。
- `src/editor/live-preview/toc-blocks.ts` — `[TOC]` → 可点击目录。
- `src/editor/live-preview/mermaid-blocks.ts` — ```mermaid → 图表；阅读态是图，光标在块内时是
  「源码 + 块后实时预览面板」（与 Typora 的 `.md-diagram-panel` 同语义）。
- `src/editor/live-preview/block-edit.ts` — 公式 / 图表编辑态的公共收尾：`exitBlock`（把光标移到块外）、
  `blockEditingKeys`（Mod-Enter / Esc）、`createPreviewPanel`（标题 + 状态 + ✓ + 内容区）。
- `src/editor/live-preview/html-blocks.ts` — HTML 块：失焦渲染（与打印同一条 `sanitizeHtml`）、
  聚焦变源码 + 块后预览。独立 `<svg>` 让给 `svg-blocks.ts`；清洗后为空就保留源码，不要留空块。
- `src/editor/live-preview/front-matter.ts` — YAML Front Matter：阅读态折叠成一行摘要
  （title / date / author，其余 +N），点开回到可编辑的原始 YAML；块级 replace 只能走 StateField。
- `src/editor/image-toolbar.ts` — 图片浮条（25/50/75/100% / 原始 / 复制路径）。
  挂在 `.cm-editor` 上、`position: fixed`：图片聚焦后 widget 已经不在 DOM 里，浮条不能放进 widget；
  尺寸写 `=宽`（按正文宽度换算，与打印栏宽一致），带 `title` 的图片只给复制路径。
- `src/editor/scrollbar.ts` — 自绘滚动条（原生滚动条已隐藏）。虚拟滚动会不断校正总高度，
  原生滑块会跟着抖；这里的规则是：**滚动期间冻结长度，停手 160ms 后重算**，
  且向上滚固定上边缘、向下滚固定下边缘。不要改回原生滚动条。
- `src/editor/live-preview/bottom-space.ts` — 文末留白的块级 widget。留白必须进 CodeMirror
  的高度表，不能用 `.cm-content { padding-bottom }`：CSS 内边距不计入高度表，滚到底会被校回去。
- `src/editor/image-drop.ts` — 拖入 / 粘贴图片。按偏好设置处理：内联 data URL、复制到当前目录、
  `${文档名}.assets/`、或指定路径；可选「优先相对路径」与「自动转义 URL」。
  写入目标由 `image-target.ts` 提供（App 在文档切换时设置），落盘由主进程 `fs:saveImage` 完成。
- `src/editor/attachment.ts` — 拖入 / 粘贴**非图片**附件（与图片同一套保存规则），插成普通链接
  `[报告.pdf](报告.assets/报告.pdf)`；编辑器里显示成带 📎 的文件名胶囊，`Ctrl/Cmd + 点击`用系统程序打开。
  识别逻辑在 `markdown/attachment.ts`（`isAttachmentTarget` / `absoluteTarget`），`.md/.txt` 不算附件。
- `src/editor/live-preview/language-widget.ts` — 围栏代码块右上角的语言标签 + 复制按钮。
- `src/editor/live-preview/bullet-widget.ts` — 无序列表的 `-` / `*` / `+` 显示成圆点。
  编辑器里是横杠、PDF 里是圆点是「两副样子」，所以统一成圆点；光标进入该行仍退回源码。
- `src/markdown/caret-syntax.ts` — 覆盖内置 `Superscript`：`^` 紧跟 `[` 时不做上标。
  否则 `脚注[^1]，第二个[^2]` 会被解析成一个横跨两个引用的上标、吞掉 `]`，脚注编号直接丢失。
- `src/editor/find.ts` / `find-highlight.ts` — 查找匹配（纯函数）与匹配高亮 `StateField`。
- `src/settings/schema.ts` — 偏好设置的**唯一结构来源**：分类 → 分组 → 行（字段 / 标签 / 说明 / 关键词 / 控件）。
  新增设置项只改这里 + `Settings`，UI 不用动；搜索直接按这些字段匹配。
  控件类型：toggle（真 switch）/ radio（segmented）/ select / range / text / style（主题卡片）/ action / note / spell。
- `src/components/Preferences.tsx` — 偏好设置窗口（左分类 + 搜索 + 通用渲染），不认识任何具体设置项；
  主题卡片是唯一例外：`control: "style"` 会调用 `settings/theme-preview.ts` 取缩略图颜色
  （`[data-style]` 只挂在 `:root`，嵌套卡片拿不到主题变量，只能内联色值）。
  每个分区标题右侧的「恢复默认」按 schema 里该节的字段回填 `DEFAULT_SETTINGS`，`customCss` 不参与。
- `src/components/FindBar.tsx` — 自写查找栏（正则 / 全词 / 大小写 / 仅选区内 / 替换）。
- `src/editor/languages.ts` / `language-completion.ts` — 90+ 语言的围栏补全。
- `src/editor/language-data.d.ts` — `@codemirror/language-data` 缺 `types` 条件的补丁声明。
- `src/editor/modes.ts` — 源码 / 专注 / 打字机模式，用 Compartment 运行时切换。
- `src/editor/link-click.ts` — `Ctrl/Cmd + Click` 打开链接或跳到 `#锚点`。
- `src/markdown/table.ts` / `slug.ts` / `frontmatter.ts` / `outline.ts` — 表格解析、锚点、
  Front Matter、大纲，编辑器与导出共用。
- `src/markdown/deflist.ts` — 定义列表判定（`术语` + 下一行起 `: 解释`）。CommonMark 里它只是一个普通段落，
  所以按行形状识别；编辑器 `analyze.ts` 与打印 `render.ts` 共用，且都只认**顶层段落**（两边必须同一口径）。
- `src/markdown/math-number.ts` — 块级公式自动编号（KaTeX `\tag{n}`）。手写 `\tag` 的公式不占号；
  `\label` / `\eqref` / `\ref` 由 `scanMath()` 一次扫全文算完（引用可以前向），编辑器
  （`math-blocks.ts` 按文档对象缓存结果）与打印（`render.ts` 的 `collectMath()`）共用同一套规则。
  引用只认数学模式里的写法，正文里的裸 `\eqref` 不处理（与 Typora 一致）。
- `src/markdown/image-size.ts` — `![alt](src =宽x高)` 尺寸语法；`withImageWidth()` 是拖拽缩放改写源码的唯一入口。
- `electron/encoding.ts` — 读文件时的编码判定（BOM → 严格 UTF-8 → GB18030）与写回编码；
  `src/io/encoding.ts` 放两边共用的类型与状态栏文案。文件层契约因此换成 `TextContent`
  （`text + encoding + bom`）：`platform().read()` 返回它，`save`/`write` 接收 `format`。
  **`electron/preload.cjs` 的 `fs.write` 必须把 `format` 转发给主进程**——漏掉时文件会被静默写成
  UTF-8（GBK 文件保存一次就坏）。
- `src/editor/extensions.ts` — 唯一的扩展装配点。`markdown()` 默认 base 是 **CommonMark**，
  必须 `markdown({ base: markdownLanguage })` 才有 GFM（删除线 / 表格 / 任务列表）。
- `src/editor/theme.ts` — 编辑器主题，颜色只引用 `src/styles/tokens.css` 的 `--wr-*`。
- `src/components/MarkdownEditor.tsx` — React 只负责挂载，`EditorView` 归组件所有。
  `doc` **不能**作为受控值驱动重建；外部替换文档走 `ref.setDoc()`。
- `src/markdown/render.ts` — Markdown → HTML（打印 / 导出）。与编辑器共用同一个 Lezer 树。
- `src/markdown/sanitize.ts` — 行内 HTML / SVG 的白名单清洗。
- `src/export/pdf.ts` — 导出 PDF 的渲染端入口：桌面端经 `window.writara.pdf` 交给主进程，
  Web 端退回系统打印对话框。
- `src/export/pandoc.ts` — Word / ePub 导出的渲染端入口：原文先交给 `pandoc-markdown.ts`
  预处理，再经 `window.writara.pandoc` 交给主进程。**不再走 HTML**：Pandoc 的 HTML reader
  会把 CSS 与 class 全丢掉，Word 里既没有字体也没有语法高亮。
- `src/export/pandoc-markdown.ts` — Markdown → 给 Pandoc 的 Markdown：去掉 Front Matter、
  `[TOC]` → `--toc`、`<!-- pagebreak -->` → openxml 分页、Mermaid 围栏与独立 `<svg>` → PNG、
  `=宽x高` / `<img width>` → `{width=…px}`（超过版心按比例缩），并清掉文件名式的 alt。
  同步改写部分（`rewriteMarkdown`）有单测；只有量图与图表渲染需要 DOM。
- `src/export/svg-raster.ts` — SVG → PNG（canvas）。Word 不认 SVG，Pandoc 在 Windows 上也没有
  rsvg-convert；打印/预览仍是矢量，只有 docx / ePub 走这里。
- `src/export/docx-templates.ts` — 内置模板 id 与显示名（`writara-cn` / `gongwen` / `tech` / `custom`）。
- `electron/pandoc.ts` — 探测并调用 Pandoc；`--reference-doc` 指向 `resources/templates/<id>.docx`，
  `--toc` / `--number-sections` 来自设置；`mark` 扩展按 Pandoc 主版本决定（2.x 没有）。
- `electron/docx.ts` — Word 收尾：只有图片的段落换 `Figure` 样式、给空目录域填缓存条目、
  补页脚页码（`第 X 页 / 共 Y 页`）、给目录加 `w:updateFields`。
- `electron/zip.ts` — 最小 zip 读写（node:zlib），供上面的收尾改 docx。
- `scripts/make-docx-templates.mjs` — 生成 `resources/templates/*.docx`（`npm run templates:docx`）。
  模板是**数据**：改排版只改脚本里的参数，不要手改二进制；样式 id 必须与 Pandoc 的 writer 一致
  （写错 id 不报错，只会静默回落到默认样式）。
- `electron/pdf.ts` — 隐藏窗口 + `printToPDF`（页脚页码由 `footerTemplate` 提供，标题生成书签）；
  导出后用 pdf-lib 补作者/主题/生成器元数据。
- **主进程构建**：`vite.electron.config.ts` 必须保留 `ssr.noExternal: true`。SSR 构建默认把依赖当
  external，而安装包里没有 `node_modules`，漏掉它会在打包后启动时直接找不到模块。
- `src/export/print.ts` — 打印区、`beforeprint`、分页测量、单文件 HTML 导出。
  `renderArticle(source, dark, resolve?)` 的第三个参数是图片解析器：项目导出按「每章所在目录」各给一个。
  `projectDocumentHtml()` 负责合并章节（目录页、章间分页）；`bodyDocumentHtml()` 给分章导出复用整套样式。
- `src/export/project.ts` — 项目导出：逐章渲染 + 跨章锚点去重 + 目录 + 章节文件命名 / 索引页。
  纯逻辑尽量少碰 DOM，页面拼装仍交给 `print.ts`。
- `src/export/highlight.ts` — 打印/导出时的代码高亮（highlight.js **完整构建**，按需加载）。
- `src/export/mermaid.ts` — Mermaid → SVG（编辑器与导出共用；按需加载）。
- `src/export/png.ts` — 按 A4 版面导出 PNG（html-to-image，按需加载）。
- `src/export/katexFonts.ts` — 20 个 KaTeX woff2 转 data URL，只在导出时加载。
- `src/export/resolve-images.ts` — 打印前把相对路径图片换成解析后的地址。
- `src/export/page.ts` — 纸张与页边距预设。
- `src/export/printStyles.ts` — 打印样式表（TS 字符串）。
- `src/workspace/` — 文件夹工作区：扫描、句柄持久化、打开/新建/重命名/删除。
- `src/components/CommandPalette.tsx` / `SearchDialog.tsx` — 命令面板与跨文件搜索。
- `src/commands/` — `menu.ts`（菜单模型与快捷键格式化）、`menus.ts`（菜单结构）、
  `shortcuts.ts`（键位表）、`editor-commands.ts`（命令 id → 编辑器函数）。
- `src/components/MenuBar.tsx` / `Sidebar.tsx` / `HelpDialog.tsx` — 菜单栏、侧栏（大纲 / 文件树）、帮助。
  文件树第一行是根节点：由 `Sidebar` 合成（`path` 为空）后交给 `TreeNodes`，不进 `buildFileTree`；
  根行接管「新建文件 / 项目菜单」，折叠键用空字符串，别在组件里另写一套树渲染。
- `src/components/ContextMenu.tsx` — 右键菜单。portal 到 `body`（侧栏有 `overflow: auto`，就地渲染会被裁掉），
  `position: fixed` 并在测量后贴边回收、子菜单右边放不下时翻到左侧。
  条目由调用方用闭包组装（`ContextEntry`：`item | separator | submenu`），组件不认识任何业务。
- `src/components/ConfirmDialog.tsx` / `confirm.ts` — 应用内多动作确认框（保存 / 放弃 / 删除 / 覆盖）。
  不要再引入 `window.confirm`：Electron 里会弹原生模态并阻塞渲染。
- `src/components/Toaster.tsx` / `toast.ts` — 固定右下角的单槽提示层；成功 4s、错误常驻、
  删除撤销 8s。新提示顶掉旧提示，不做通知中心。
- `src/components/BusyOverlay.tsx` + `App` 的 `withBusy` — 长操作提示（打开大文件、扫描文件夹、
  跨文件搜索、项目导出、文档体检、编码转换）。`withBusy` 必须先 yield 一帧再执行，否则同步的
  `setDoc` / `runChecks` 会把提示条一起卡住，用户还是看不到。工作区扫描没有走 `withBusy`，
  由 `workspace.busy` 合成同一条提示。
  **已知上限**：主进程 `decodeBuffer` 仍是同步解码，超大文件（尤其 GBK）在解码期间窗口仍可能
  被系统标成无响应；彻底解决要把解码搬进 worker。CodeMirror 解析超大文档同样会阻塞渲染进程，
  提示条能显示，但界面在那几秒里确实不能操作。
- `src/ai/agent-run.ts` — **AI 的唯一执行入口**：`selectedAgent` / `runAgentTask` / `agentContext`。
  AI 只走本机 coding-agent CLI（OpenCode / Claude Code）：模型、端点、Key 都由 agent 自己的配置负责，
  Writara 不保存任何凭据。`settings.aiAgentId` 形如 `cli:opencode`，`aiAgentModels` 按 agent 存模型。
- `electron/ai-agent.ts` — 主进程侧：检测 PATH 上的 CLI（`where` / `--version`，缓存 60s）、
  按 agent 拉模型（`opencode models`）、在 `<userData>/agent-runs/<runId>/` 准备
  `TASK.md + document.md + WRITARA.md` 后运行、结束后只读回 `document.md`、清理临时目录。
  项目任务多传一个 `files` 数组：按相对路径写进同一个临时目录，结束后逐文件读回；
  路径必须过 `safeRunPath`（拒绝 `..`、绝对路径、盘符），越界文件直接跳过。
  **两个 Windows 坑**：npm 的 `.cmd` 只是包装，要解析出真实 `.exe` 直接 spawn（经 `cmd.exe` 会让
  `opencode run` 卡住）；spawn 后必须 `stdin.end()`，否则 CLI 会等 stdin 不开始。
  目前只允许运行 OpenCode / Claude Code；其他 CLI 检测到但禁用。
- `src/ai/client.ts` — 旧版 BYOK HTTP 客户端（SSE / 工具调用 / 模型列表），当前 UI 不再调用；
  保留是为了将来 Web 端或外部网关接入，不要在 AI 面板里重新引入端点/Key 配置。
- `src/ai/prompts.ts` — 动作表（润色 / 扩写 / 缩写 / 续写 / 初稿 / 校对 / 审稿 / 去腔 / 表格 / 图表 / 公式）
  与系统提示词；`taskForAction()` 把动作转成给 CLI 的指令文本。
- `src/ai/antislop.ts` — 反 AI 腔·规则层：纯函数、离线可用（套话 / emoji / 列表腔加粗 / 打圆场收尾），
  跳过 front matter、围栏代码、行内代码与链接地址。默认**先标记、再应用**：`scanSlop` 只出区间，
  `applySlop` 才删字；标记层在 `src/editor/slop-marks.ts`（文档一变就清空）。
- `src/editor/slop-marks.ts` — AI 腔标记（StateField + 装饰），四类命中各自的 title 与底色；
  不要在这里做扫描，规则只在 `antislop.ts` 一份。
- `src/ai/useAi.ts` — 单步动作：动作 id → 任务文本 → `runAgentTask` → 审阅浮层
  （source = 当前全文，output = agent 改后的全文）→ 一次 dispatch 写回。没有流式：CLI 运行期间
  只显示阶段；结果仍是 diff 审阅。
- `src/ai/useChat.ts` + `components/ChatPanel.tsx` — 右侧 AI 对话（可折叠，状态存
  `localStorage: writara:chat-open`）。同样只走 agent；结果与原文比对后 `minimalChange` 找最小变化段、
  一次 dispatch 写回。对话面板**底部**有模型切换器，列表来自当前 agent（`ai:models`），切模型写
  `aiAgentModels[agentId]`。
- `src/components/AiAgents.tsx` / `AiContext.tsx` — 设置里的「执行 Agent」与「规则与记忆」：
  Agent 检测 / 选择 / 每 agent 模型 / 测试；全局规则与长期记忆（「记住：…」写入，注入所有任务）。
- toast 里的「撤销」**不依赖 CodeMirror 历史**（焦点在聊天框、HMR 后实例差异都会让它失效），
  而是保存改动前文本 + 校验当前仍等于改动后文本，再整篇回滚；不一致就提示用 Ctrl+Z。
  新增「改动后给撤销」的动作照这个模式写，不要直接 `undoCommand(view)`。
- `src/components/AiReview.tsx` — AI 审阅浮层（行级 diff / 替换 / 放弃 / 停止），portal 到 body 的
  `#wr-ai-root`（fixed 定位）。diff 配色只引用 `--wr-diff-*`（由 `--wr-ok` / `--wr-bad` 派生），
  六主题与暗色自动跟随。
- `src/editor/ai-toolbar.ts` — 选区浮条：ViewPlugin 挂 DOM、`position: fixed`，动作经
  `writara:ai-action-selection` CustomEvent（`bubbles: true`）交给 React。插件不持有 AI 状态；
  坐标读取必须推迟到更新周期外（与图片浮条同一约束）。
- `src/workspace/templates.ts` — 文档模板。模板就是普通 `.md`：内置两份打进包里（语法示例集 /
  技术方案骨架），工作区 `.writara/templates/*.md` 自动进「文件 → 从模板新建」。**没有占位符替换**；
  菜单项 id 是 `from-template-<模板 id>`，App 按前缀分派。
- `src/workspace/config.ts` — `.writara/` 的路径契约（模板 / 提案目录）。工作区扫描默认跳过 `.` 开头
  的目录，`useWorkspace` 扫描时显式 `include: [".writara"]`，结果分成 `files`（进文件树）与
  `configFiles`（配置与扩展，不进文件树）。新增 `.writara` 能力只改这里的前缀，别在组件里拼字符串。
- `src/ai/checks.ts` — 文档体检：写作流水线的「编译器」，覆盖结构 / 语言 / 链接 / 形式 / 风格 /
  长篇（`src/components/CheckReport.tsx` 呈现，右侧浮层，跳转不关面板）。纯函数、可单测；
  `fix` 只给低风险项（中文半角标点）。新增规则必须能落到文档偏移并写测试。
- `src/ai/project.ts` — 项目写作规范（`WRITARA.md` / `AGENTS.md`）：取清单 `instructions` 指向的那份，
  否则取离当前文档最近的祖先，按预算截断后拼进 system。实现在 `src/project/guide.ts`。
- `src/project/guide.ts` — 指令文件查找的唯一入口：`rootGuideOf`（项目身份，只认根目录）与
  `findGuideFile`（AI 上下文，支持 `instructions` → 最近祖先 → 根目录）。两份都在时 `WRITARA.md` 优先。
- `src/project/manifest.ts` — 项目清单 `.writara/project.json` 的解析 / 校验 / 序列化（纯函数，可单测）。
  越界路径（绝对路径、盘符、`..`）在解析阶段丢弃；坏清单返回原因而不是抛错。`order` 缺省时，
  有 `spine` 视为 `custom`（兼容旧清单）。
- `src/project/file.ts` — 清单读写与新建项目落盘：`readProject(root, files)` 以「指令文件存在，或清单存在」
  判定项目，坏清单降级成普通文件夹 + 原因；`createProjectFiles` 写清单、建 `资料/`、按需补 `WRITARA.md`
  （已有的 `WRITARA.md` / `AGENTS.md` 都不覆盖），并回填 `instructions`。
- `src/project/order.ts` — 项目正文范围与顺序（纯函数）：排除 `exclude` / `资料/` / 指令文件，
  `order = custom` 按 `spine`，spine 为空退回自然序。导出、项目设置、项目 AI 共用这一份。
- `src/workspace/assets.ts` — 资源分类（图片 / 附件 / 其它），只用于文件树图标；
  搜索、命令面板、AI 文档列表仍只收 Markdown。
- `src/components/ProjectDialog.tsx` — 新建 / 转为项目对话框（名称 + 类型 + 是否补规范骨架）。
  它只收集输入，`.writara/` 的路径与写法由 `src/project/file.ts` 决定。
- `src/components/ProjectSettings.tsx` — 项目设置：名称 / 类型 / 自然序与自定义序切换 / spine 上移下移 /
  导出目录与分页。保存后由 App 写清单并 `reloadProject()`。
- `src/components/ProjectAiDialog.tsx` + `src/ai/project-run.ts` — 项目 AI：选文件 → 临时副本运行 →
  逐文件 diff → 勾选写回。写回沿用「当前文一次 dispatch、其他文件先校验再写」的通道，
  并在提示条里提供整批撤销。
- `src/ai/brief.ts` — 写作任务单（读者 / 篇幅 / 必须覆盖 / 禁止 / 语气 / 档位），存 localStorage；
  它是分节初稿的输入，也是「精细化」从形容词变成约束的地方。
- `src/ai/pipeline.ts` — 分节初稿：先规划大纲，再逐节生成。只产出 Markdown，不碰编辑器；
  写回仍然由审阅浮层（diff + 用户确认 + 一次 dispatch）负责。章节上限 10，失败只损失当前节。
- `src/ai/proposals.ts` + `components/ProposalPanel.tsx` — 提案收件箱：外部 agent 往
  `.writara/proposals/*.proposal.md` 写「front matter + 目标文件完整新内容」，用户在面板看 diff 后
  接受。当前文档走一次 dispatch（可撤销），其他文件直接写盘；提案文件保留，不自动删。
  这是「AI 改动必经审阅」在应用外也成立的通道，不要绕过它直接改文件。
- `src/markdown/table-edit.ts` — 表格的结构化编辑，**纯文本变换**（`TableTarget` → `TableChange`），
  不碰 DOM 也不碰 CodeMirror，方便单测；`src/editor/table-menu.ts` 负责定位表格（选区优先，
  渲染态表格的点击由 widget 映射到单元格）并把命令 dispatch 回编辑器。
  新增表格命令只加一个 case + 一个测试，不要在菜单里手写字符串拼接。
  **列宽用分隔行的横线数量编码**（`| --- | ------- |` 表示第二列更宽）：GFM 允许任意数量的 `-`，
  这是唯一不需要往文件里塞私有元数据的存法；`setColumnWidths()` 负责换算，打印端据此输出
  `<colgroup>`。拖拽期间只改 `<col>` 的像素宽度，松手才 dispatch —— 每次 mousemove 都写文档会让
  widget 重建，手柄连同监听一起消失。
- `src/editor/clipboard.ts` — 复制为 Markdown/HTML/纯文本、剪切、粘贴为纯文本。
- `src/editor/smart-punctuation.ts` — 智能标点输入处理器。
- `src/io/line-endings.ts` — 打开归一为 LF，保存按原文件写回 CRLF/LF。
- `src/io/image-resolver.ts` — 图片解析器（模块级单例）+ `fileToDataUrl`。
- `src/workspace/paths.ts` — 文档相对路径 → 工作区路径。
- `src/workspace/store.ts` — 工作区根目录 / 图片根目录 / 最近文件夹的持久化（平台层序列化的身份）。
  最近文件夹用 `mergeFolders` 按名字去重、上限 8；菜单项 id 是 `recent-folder-<index>`，
  注意它同样以 `recent-` 开头，`runCommand` 里必须**先**匹配 `recent-folder-`。
- `src/storage/recent.ts` — 最近文件（平台身份存 IndexedDB）。
- `src/styles/themes.css` — 6 套主题（只覆盖 CSS 变量）。
- `src/App.tsx` — 壳层：工具栏、状态栏、快捷键、设置对话框、`beforeunload`。
- `src/document/useDocument.ts` — 文档状态机：文本、文件名、文件身份（`DocRef`）、脏标记、保存/另存/打开。
  从外部换文本时用 `loadToken` 让编辑器同步，**不要**把 `doc` 变成受控值。
- `src/document/restore.ts` — 「磁盘 vs 草稿」的恢复决策（纯函数，有测试）。
- `src/platform/` — 文件层的唯一入口：`types.ts` 定义平台无关的 `DocRef` / `PlatformFs`，
  `browser.ts` 用 File System Access 实现，`desktop.ts` 用 Electron IPC 实现。
  文档、工作区、最近文件只认 `DocRef`，**不要**在组件或 hook 里直接碰 `FileSystemHandle`。
  配置文件（项目清单）走 `readRootFile` / `writeRootFile` / `createRootDir`；不要为了读一个 JSON
  放宽 `scan()` 的 Markdown 过滤，`files` 会流向文件树、搜索与命令面板。
- `electron/main.ts` — 主进程：窗口、`app://` 协议、单实例与文件关联、关窗拦截（脏标记由渲染进程上报）。
  **窗口创建即显示**（底色跟随 `nativeTheme`），不再用 `ready-to-show` 控制可见性：那个事件要等渲染进程
  画出第一帧，用户在此之前完全看不到窗口。开窗前的活（`loadWindowState` 读文件、`loadAllowedState`、
  原生菜单、命令行文件）都排在 `createWindow()` 之后。
  排查启动用 `WRITARA_STARTUP_LOG=1`：时间戳写进 `userData/startup.log`（`process.uptime()` 基准，
  `main-module / app-ready / window-shown / dom-ready / did-finish-load`）。
  部分 Windows 机器上 GPU 沙箱初始化要二十多秒（`dom-ready` 迟迟不来，窗口全白）；
  开窗 5 秒还没 `dom-ready` 就写 `userData/gpu-fallback.json`，下次启动加 `--disable-gpu-sandbox`。
  只降级 GPU 进程，渲染进程仍 `sandbox: true`。
- `electron/updater.ts` — 在线更新（GitHub Releases）。`electron-updater` 用 `import()` 按需加载，
  启动 8 秒后才检查，不占启动时间；`autoDownload = false`，下载 / 重启安装都由用户点。
  `app-update.yml` 由 electron-builder 生成（`publish.owner = NBullet` / `repo = Writara`，
  `releaseType: draft`）。安装包未签名，所以 `win.verifyUpdateCodeSignature: false`；
  签名之后要删掉它，让更新校验发布者。发布用 `GH_TOKEN=... npm run release`，然后到 GitHub
  把草稿 release **发布**（更新只认已发布的 release）。**只发布 NSIS 一个目标**（`--win nsis`）：
  nsis + portable 同时发布会各建一个 draft，资产被拆开。`latest.yml` 里的文件名是连字符版
  （`Writara-Setup-0.2.0.exe`）：`--publish always` 会自动改名，手动上传要按这个名字。
- `src/updates/` + `components/UpdateBanner.tsx` — 更新状态与横幅（和文件错误共用 `.wr-banner`）；
  菜单「帮助 → 检查更新…」会先打开关于页再检查（GitHub 慢的时候要十几秒，必须让用户看见转圈和结果），
  关于页底部的胶囊按钮是 Lucian #001 的移植，状态由 `useUpdater` 驱动。Web 版没有
  `window.writara.updates`，菜单项、横幅和关于页按钮都不出现。
- `src/components/HelpDialog.tsx` — 关于页（作者 / 邮箱 / GitHub / 版本）。版本号由 `vite.config.ts` 的
  `define` 从 `package.json` 注入成 `__WRITARA_VERSION__`，不要在组件里写死；改版本只改一处。
- `electron/ipc-fs.ts` — 文件 IPC。**只信任**来自对话框、命令行参数、已授权工作区根目录的路径；
  渲染进程传来的路径一律先过 `assertAllowed`，否则恶意 `.md` 里的图片地址会变成任意文件读取。
  写入走「同目录临时文件 + rename」原子替换；目标被占用导致 rename 失败时退回直写。
  监听**当前文档所在目录**（不是文件本身：原子写会换掉 inode），外部修改推 `app:file-changed`；
  自己写入后 800ms 内的事件忽略，避免「保存触发的重载」。
  同时监听工作区目录（`recursive`），增删 `.md` 推 `app:workspace-changed`；
  `fs:saveImage` 负责把图片写进 `${文档名}.assets/`（重名自动加 -1）；
  删除撤销走 `fs:restoreFile`：按相对路径重建，目标已存在时拒绝，不覆盖。
  **白名单要跨启动保留**：只存在内存里时，重启后「恢复上次会话」会撞上 `assertAllowed`，
  每次启动都弹「没有访问该文件的权限」。现在持久化到 `userData/allowed-paths.json`（用户打开过的
  文件/目录，最多 200 / 40 条，读取时剔除已不存在的），恢复流程再用 `fs:authorizeRestore`
  重新登记会话与最近列表里的路径（只收绝对路径、必须存在、单次 ≤12 条、不读内容）。
- `electron/window-state.ts` — 窗口位置/大小记忆。恢复时校验是否落在某块屏幕内，
  否则退回默认尺寸（换显示器后窗口不能「打开但看不见」）。
- `electron/menu.ts` — 原生菜单，结构直接读 `src/commands/menus.ts`（构建时打进 `dist-electron/main.js`），
  命令 id 与 Web 版共用。**刻意不设 accelerator**：菜单快捷键没有「焦点在输入框就跳过」的判断，
  会和查找栏、对话框抢键；快捷键仍由渲染进程的 window 捕获阶段处理。
- `electron/preload.cjs` — 必须是 CommonJS（`sandbox: true` 不支持 ESM preload），
  用 `contextBridge` 暴露窄接口 `window.writara`，并负责 `app:shell-ready`（命令行文件要等订阅好再发）。
- `src/io/file-system.ts` — 浏览器句柄原语（打开 / 写入 / 下载）；非 Chromium 降级为下载。
- `src/storage/session.ts` — IndexedDB 存平台层序列化后的文件身份 + 上次保存的文本。
- `src/storage/settings.ts` — 设置（主题 / 字号 / 栏宽 / 草稿延迟 / 自动保存 / 自定义 CSS / 图片与附件规则 / 导出）。
  桌面端存 `userData/app-state.json`（启动时同步读取），localStorage 只作 Web 兜底与一次性迁移。

## 命令与菜单

- 命令 id 是菜单、快捷键、命令面板的唯一契约：新增命令要同时改
  `menus.ts`（结构）、`shortcuts.ts`（键位）、`editor-commands.ts` 或 `runCommand`（行为）。
- 写作流水线的命令 id：`check-document` / `check-fix-all` / `brief-draft` / `proposals-open` /
  `chat-toggle`。它们**不能**用 `ai-` 前缀（`ai-` 前缀由 `useAi.runCommand` 独占，会被提前拦截）。
- **最近文件 / 文件夹的菜单 id 带路径**（桌面端 `recent-file:<编码后的路径>`、
  `recent-folder:<路径>`），不要改回 `recent-<下标>`：菜单状态是全局的，由最后更新的窗口写入，
  点击却可能发生在另一个窗口；两边最近列表不同时，按下标会错位或静默什么都不做。
  浏览器端没有路径，仍用下标。
- 全局快捷键在 window 捕获阶段处理，先于 CodeMirror；`EDITOR_NATIVE`（撤销/重做）
  必须放行给 CodeMirror，否则会破坏它自己的历史行为。
- `Tab` 必须在编辑器里绑定（`extensions.ts` 的 `indentBlock`），不要让它回落到浏览器默认行为
  把焦点带出编辑区。规则在 `commands.ts`：列表项**整块**（含子项）缩进，且只能挂到
  **上一个兄弟项**的内容列下面（第一项不动、重复 Tab 不再右移 —— 否则缩进会无限增长，
  正文被挤出屏幕，源码模式重排时整页卡死）；有序表按标记宽度（`1. ` 是 3 列）；
  有选区按行缩进；普通段落插入一个缩进单位。键盘要跳出编辑区用 `Ctrl+M`（CodeMirror 的 tab focus mode）。
- 菜单只放真实可用的项。浏览器做不到的（窗口置顶、开发者工具、应用内窗口切换）宁可不放，
  也不要放一个点了没反应的条目。
- 右键菜单是**命令的第二入口**：文件树（打开 / 打开所在文件夹 / 复制路径 / 重命名 / 删除）、
  编辑器（剪切复制粘贴 / 复制为 / 表格）。只往里头放已经存在或这次一并实现的动作；
  桌面端才有的项（绝对路径、资源管理器）在没有 `window.writara` 时整条不出现，不要放一个 disabled 的假条目。
- `contextmenu` 里先 `preventDefault()`：Electron 自己不带默认菜单，不拦就会什么都不弹。
- 侧栏两种视图（大纲 / 文件树）共享同一份工作区数据，筛选框在两种视图下都生效。
- 文件树：文件夹可折叠（点击整行切换），**筛选时强制全部展开**（否则命中项会藏在折叠目录里）；
  当前文档高亮并自动展开其祖先目录、滚进视野；行内 `user-select: none`（否则拖选会选中整行文字）。
  祖先目录用 `workspace/tree.ts` 的 `folderPathsOf()`，不要在组件里再拆一遍路径。
- 打开文件后自动把它所在的目录设为工作区（`workspace.openAt`，不弹对话框）；文件本来就在当前
  工作区里时保持原根目录不动。这样「打开单个文件」也能立刻看到同级目录的 Markdown。
- 主题只覆盖 CSS 变量（`data-style`）。打印样式**必须**用 `var(--wr-*, 回退值)`，
  不能写死颜色；导出时 `theme-vars.ts` 会把当前主题变量内联进单文件 HTML。
- 菜单里新增命令的 id 同时用于命令面板；`createMenus` 对新增字段要做空值兜底，
  否则 HMR 或旧状态会让整个应用白屏。
- 代码块高亮依赖 `markdown({ codeLanguages: languages })`（来自 `@codemirror/language-data`）；
  漏掉这个配置时围栏代码只有等宽字体、没有 token 颜色。
- 块级 widget 的点击要自己映射到源码位置（图形/公式/图表跳到块开头；表格由
  `table-focus.ts` 记住单元格并开浮层），否则光标只会落在块的起始/结束位置，表现为「光标漂移」。
- 打印/导出的唯一入口是 `renderArticle`（`print.ts`）：代码高亮、Mermaid、图片解析都在里面。
  预览页、`printMarkdown`、`downloadHtml`、`exportPng` 必须共用它，否则会出现「预览有图、打印没图」。
- 浏览器菜单打印不会等待异步渲染，App 里停笔 1.5s 会 `preparePrintView`；
  `beforeprint` 只做同步兜底，不要删掉预渲染。
- Mermaid 必须先 `parse` 再 `render`，并保持 `suppressErrorRendering: true`。
  否则语法错误时 mermaid 会往 `document.body` 插一张巨大的错误图，直接把布局撑坏。
- `--wr-bg` 是文档与打印的颜色（默认纯白），外壳（顶栏/侧栏/状态栏）用 `--wr-surface`。
- ```mermaid 的 widget 是异步渲染：先插占位，完成后 `view.requestMeasure()`；
  主题切换靠 `refreshPreviewEffect` 触发重建，否则旧配色会一直留着。
- 相对路径图片依赖模块级解析器：App 里**先** `setImageResolver`，**再**同步文档，
  顺序反了会拿到旧解析器（占位不消失）。
- KaTeX 字体是独立 chunk（约 350KB），只在 `downloadHtml` 时动态加载；不要静态引入。

## 文件与保存

- `Ctrl+S` 必须写回原文件。只有浏览器没有 File System Access 时才退化成「下载副本」，
  并在提示条说明差别。
- 保存前先读磁盘，内容与 `savedText` 不一致就先 `confirm`，**不允许静默覆盖**别处的修改。
- `requestPermission` 只能在用户手势里调用（Ctrl+S / 点击保存）；不要在挂载时申请。
- 文件级自动保存（`autoSaveFile`）只在 `hasWritePermission` 已为 `granted` 时写盘，**绝不弹权限框**；
  写前必须比对磁盘，别处改过就暂停并提示，等 `Ctrl+S` 确认。
- 实现在 `useDocument` 的 effect 里，`writing` ref 保证同一时间只有一次写盘。
- 句柄进 IndexedDB，文本进 localStorage 草稿；两者用途不同，别合并。
- 重新打开页面：草稿有新内容就保留草稿；磁盘也被改过时给冲突提示（`decideRestore`）。
- **会话恢复是异步的，必须防竞态**：读盘期间用户可能从命令行 / 文件关联打开了别的文件；
  `adopt` 之前要再查一次 `shouldRestore()`，并且身份（ref / name）只在最终 `adopt` 时一次性生效。
  否则会把「上次会话的草稿」写进刚打开的那个文件（真实事故：一个文件被写成另一个文件的内容）。
- 输入法组合期间（`view.composing`）不重建装饰，否则会打断候选/上屏。
- 组合期间也不要从 React effect 里 `view.dispatch(...)`：查找高亮、打印预渲染、打字机滚动都要先判断
  `view.composing`。一次空事务就可能让 Chrome 结束组合、把光标弹回组合起点，表现为「光标乱飘、输入失败」。
- 组合期间**不要同步 React**：`createEditor` 在 `view.composing` 时跳过 `onChange` / `onSelection`，
  到 `compositionend` 再补一次。否则长文档里每个拼音字母都会触发整页重渲染，输入法会掉候选、光标乱跳。
- 保存 / 导出 / 打印用编辑器里的最新文本（`liveText()`），不要用可能落后于光标位置的 `doc.text`
  （组合刚提交、React 状态还没跟上时会写进旧内容）。

## 编辑器渲染约束

- 显隐以**行**为单位：选区与该行相交就露出源码，否则隐藏（`touchesLine`）。
- 新增标记语法只改 `analyze.ts` 的 `HIDDEN_MARKS` / `MARK_NODES`，不要在 plugin 里另起判断。
- 隐藏范围要吞掉标记后的空格（标题 `## `、引用 `> `），否则行首残留空格。
- 只分析 `view.visibleRanges`，不要为了「完整性」全文档遍历。
- **块级装饰必须来自 `StateField`**：`ViewPlugin` 提供 block widget 会抛
  "Block decorations may not be specified via plugins"。这正是不把 SVG / 表格 / TOC 放进 `livePreview` 的原因。
- 块级 widget 有三种编辑态，新增块型先对照 `docs/focus-views.md` 选一种：
  ① 退回源码（SVG / TOC）；② 常驻 + 浮层（表格）；③ 源码 + 块后预览（公式 / Mermaid）。
  ③ 的退出契约统一由 `block-edit.ts` 提供（Mod-Enter / Esc / ✓），不要各写一套。
- 预览面板是块级 widget：纵向间距只用 padding，`estimatedHeight` 取偏小值。
  公式用 `updateDOM` 就地换公式；Mermaid 异步渲染时保留上一版图（只降透明度 + 状态字），
  **不要**每次按键把面板清空——高度表会抖，看起来像闪屏。
- **`ViewPlugin.update()` 里不能读布局**（`coordsAtPos` / `getBoundingClientRect`）：
  CodeMirror 会抛 `Reading the editor layout isn't allowed during an update` 并**销毁这个插件**
  ——表现是「功能只出现一次，之后再也不出现」。浮层定位要推到更新周期之外。
  别用 `requestAnimationFrame`：窗口被遮挡时 Chromium 会把它完全暂停（实测 400ms 一次都不触发），
  用 `setTimeout(0)`。
- Compartment 的 `reconfigure` 接收的是**内容**，不是 `compartment.of(...)`；
  传错会抛 "Duplicate use of compartment in extensions"。
- 标题锚点由 `slug.ts` 统一生成：编辑器内链跳转与导出 HTML 的 `id` 必须同一套规则。
- 自定义语法（`==高亮==`、`$公式$`）必须同时注册到两处：`markdown({ extensions })` 与
  `writaraParser`；漏一处就会出现「编辑器认、导出不认」。
- 块级公式 `$$…$$` 没有解析器节点，靠段落文本模式识别（`render.ts` 与 `math-blocks.ts` 两处）。
- 重量级渲染库（highlight.js / mermaid / katex）里，前两个按需动态加载；
  KaTeX 是同步渲染，静态引入。
- 打印的代码高亮用 highlight.js **完整构建**（`lib/common` 只有 37 种语言，和编辑器对不上）；
  新增语言别名在 `highlight.ts` 的 `resolved` 里映射（如 `asm` → `x86asm`）。
- 查找高亮走 `findHighlightField`（StateField）；查找匹配逻辑在 `find.ts`，不要在组件里重写。
- 段落之间没有 margin：编辑器里两段之间的**那一行空行**就是段间距（打印端给等值的 margin 对齐）。
  标题不再用 `padding-top` 撑开上方空白（空行已经给了），只给 `padding-bottom`；
  数值全部来自 tokens.css 的排版基准。**不要**在 `.cm-line` 上用垂直 margin：
  CodeMirror 的高度表只量 `offsetHeight`，margin 不计入，会让 `posAtCoords` 整体偏移——表现就是
  「点这里，光标跑到上一行/下一行」。同理，块级 widget（TOC 等）也只用 padding 做纵向间距。
- 代码块/围栏行的行盒高度必须与正文一致（`calc(var(--wr-font-size) * var(--wr-lh))`）。CodeMirror 会挑一条
  「纯 ASCII 且较短」的行量化 `lineHeight`，再用它估算所有未渲染行；代码块比正文矮时全局估算会被拉低，
  滚到代码块总高度突然收缩、滚动位置被钳制，表现就是「滚下去又被缩回来」。
  围栏行现在只剩一个**空白行盒**（``` 与语言名都被隐藏），靠代码底色充当代码块的上下内边距；
  同样不能压矮，也不要用 CSS 隐藏整行（行盒还在，高度表才稳）。

## 设计基准（外壳 UI）

- 外壳 UI（工具栏 / 对话框 / 浮条 / AI 面板 / 提示层）的颜色、间距、字号、圆角、阴影、遮罩、
  z 层级**只引用** `src/styles/tokens.css` 的外壳基准段（`--wr-space-*`、`--wr-ui-fz*`、
  `--wr-radius-*`、`--wr-ok` / `--wr-bad`、`--wr-diff-*`、`--wr-shadow-*`、`--wr-scrim`、`--wr-z-*`）。
- **不写死色值**：`src/styles/tokens.test.ts` 会扫 `src/`，白名单（tokens.css / themes.css /
  打印导出链路 / 主题缩略图 / 示例文档）之外任何 `#rgb`、`rgba()` 都算违规，`var()` 回退值豁免。
  新增颜色先加 token；确实只在一处成立的颜色，也写进 tokens.css 并注释用途。
- 新浮层的 z 层级用 `--wr-z-*` 档位（`--wr-z-float` 编辑器浮条 / `--wr-z-ai` 审阅浮层 /
  `--wr-z-dialog` 对话框 / `--wr-z-toast` 提示层），不再引入任意数字；旧界面的 z 值维持原状。
- 文字与强调走 `--wr-text` / `--wr-muted` / `--wr-accent`；实心强调块上的文字用 `--wr-ink`，
  不要在按钮里直接写 `#fff`（换成深色主题时会看不出对比）。
- 状态语义：成功 / 新增取 `--wr-ok`，错误 / 删除取 `--wr-bad`。diff 只认 `--wr-diff-ins-bg` /
  `--wr-diff-del-bg`，不要给 AI 界面另起一套红绿。
- 三栏布局：`--wr-a4-width`（672px = A4 内容宽 178mm）是编辑区最小宽度；`.wr-canvas` 用它做
  `min-width`，中间 `.wr-scroll` 负责横向滚动。窗口放不下三栏时**不再自动收起对话**：
  侧栏与 AI 面板改用浮层（`.wr-panel.is-float`，绝对定位在 `.wr-body` 上、不占布局宽度），
  各自有收起按钮（侧栏 ✕ / 对话「收起面板」），浮层仍可拖宽。
  侧栏只在非浮层时压缩**显示宽度**，不改用户保存的偏好。
  对话面板宽度可拖（280–520），持久化在 `localStorage: writara:chat-width`。
- 启动过渡页：`index.html` 只放静态结构，进度与「上下分裂」由 `src/startup-splash.ts` 驱动。
  **不要内联启动脚本**：Electron 的 CSP 是 `script-src 'self'`，内联脚本会被拦，启动页会永远停住
  （兜底也在同一段脚本里）。退出由 App 挂载后调用 `markSplashReady()` 触发，不按固定时长硬拖：
  最短 250ms、停顿 80ms、分裂 640ms（必须 ≥ `index.html` 里 `.ws-half` 的 transition），30s 兜底。
  `?print=1` 直接移除启动页，不播动画。
- AI 对话的输入框 / 思考态 / 气泡取自 Lucian UX/UI Prompt #028、#086、#233（MIT），元素文件头部的
  license 注释必须保留；颜色一律映射到 `--wr-*`，不要把 `--ux-*` 引进来。
  composer 的规划参考 OpenChamber：**运行状态在顶部一行，输入居中，工具 / 模型 / 发送在底部一行**；
  不要再把模型下拉单独摆在输入框下面，也不要给输入框加厚聚焦环（1px 边框 + 3px 淡光即可）。

## 打印 / 导出约束

- 桌面端「导出 PDF」走主进程的 `printToPDF`（`electron/pdf.ts`），不弹打印对话框：
  用 `exportableHtml()` 生成自包含 HTML（与「导出 HTML」同一份）→ 隐藏窗口加载 →
  等 `document.fonts.ready` 与图片 decode → `printToPDF({ printBackground, preferCSSPageSize })`。
  **不要传 `margins`**：纸张与页边距由 `page.ts` 生成的 `@page` 决定，多一处来源就多一份不一致。
- **永远不要直接打印编辑器 DOM**。CodeMirror 只渲染视口，`Ctrl+P` 会打出一屏空白。
  打印前先把 Markdown 渲染成静态 HTML 放进 `#wr-print-host`，`@media print` 隐藏 `#root`。
- 原生打印（浏览器菜单 / `Ctrl+P`）依赖 `beforeprint` 里重新渲染打印区，别删这个监听。
- **导出 PNG 不能直接截屏幕外的 `.wr-print-host`**：`html-to-image` 会把 `left:-20000px` 一起克隆进
  `foreignObject`，结果是一张纯白图。`src/export/png.ts` 在截图期间把宿主临时放到 `0,0`，用
  `z-index:-1` 藏在应用后面，结束后恢复原样式。
- `PRINT_CSS` 必须是 TS 字符串，**不要改回 `?raw` 导入**：vitest 里 `?raw` 会返回空字符串，
  导出文件会静默丢掉全部样式。
- A4 参数只认 `page.ts`：`@page` 的页边距、正文可用高度（`contentHeightMm`）、
  导出模板里内联脚本的 `LIMIT` 都由 `resolvePage()` 算出来，不要再写死 255。
- **打印与编辑器必须是同一套排版/样式**：字号、行高、栏宽来自 `tokens.css` 的排版基准，
  颜色与字形（链接下划线、高亮底色、代码内边距、复选框字体、列表符号、emoji）两边必须一致。
  `src/styles/consistency.test.ts` 会把两边逐项比对，**任何一边改了另一边没跟上，测试直接红**——
  这类「屏幕上和 PDF 不一样」的问题不允许再靠肉眼发现。
  - 编辑器里「两段之间的空行」就是段间距本身，所以打印端给同样的 margin；`.wr-gap`（渲染器加的 class）
    负责把「标题与下一块之间的空行」也补上，否则屏幕上标题下有空行、纸面上没有。
  - 间距必须按**正文字号**折算（`--wr-font-size * 系数`），不能用 `em` 给标题设 margin：
    em 在标题上按标题字号放大，h1 的上下空白会变成 h3 的两倍——这就是之前「标题空得离谱」的根因。
  - 字体分工：`--wr-font-prose`（正文，屏幕优先的无衬线）、`--wr-font-heading`（标题，衬线）、
    `--wr-font-ui`（外壳）。编辑器标题与打印 `.wr-doc h1–h6` 都引用 heading，导出时由 `theme-vars.ts` 内联。
    不要用 `-webkit-font-smoothing: antialiased`：Windows 上会关掉亚像素抗锯齿，正文会发虚。
- 打印**不改字号**：`resolveLayout()` 只缩栏宽（`min(measure, 纸张可用宽)`），字号永远是编辑器那个值。
  A4 常规左右边距取 16mm，正好剩下 178mm ≈ 672px = 默认 42rem 栏宽，所以默认设置下纸面与屏幕逐字对齐。
  它同时把 `--wr-font-size` 覆盖成本文档的实际字号，间距随之一致缩放；结果进 `pageCss`，
  预览、PDF、导出 HTML 三处共用。
- PDF 预览窗口用 `#zoom=100` 打开：阅读器的「适应页面」会缩到 ~88%，看着比编辑器小一圈，
  会让人误以为字号不一致。窗口宽度也要够（1240），否则 100% 下出现横向滚动条。
- 分页策略：
  - 标题 + 紧随的块包在 `.wr-keep`（`break-inside: avoid`），避免页尾孤行。
    **表格不要进 `.wr-keep`**：整组不可分割时 Chrome 会丢掉 `thead` 的跨页重复，还会把行拆到两页。
  - 高过一页的块在打印前测量并加 `.wr-split`，否则整块被推到下一页、上一页留白。
  - 表格 `thead` 设为 `table-header-group`，跨页重复表头。
  - 长代码块用 `white-space: pre-wrap`，打印不能横向滚动。
- `<!-- pagebreak -->` 渲染成 `.wr-page-break`（`break-after: page`），HTML 里没有别的分页手段。
- 导出文件是自包含 HTML：样式内联 + 打印前测量脚本，不允许引用外部资源。
- Word / ePub 走 Pandoc，**不内置**：路径来自设置（留空自动探测），找不到就明确报错。
  输入是 Markdown 而不是 HTML，样式来自 `--reference-doc`（随包模板在 `resources/templates`，
  打包靠 electron-builder 的 `extraResources`）。**模板只带样式与 sectPr**：页眉页脚与目录域
  不会被 Pandoc 复制，所以页码和目录缓存在 `electron/docx.ts` 里补。
- 图片宽度用 px 写进 `{width=…px}`：Pandoc 的 docx writer 会忽略百分比（实测 `{width=100%}`
  也退化成 1pt），版心上限取 520px。只有图片的段落由收尾改成居中的 `Figure` 样式，
  否则会吃到正文的首行缩进、整张图往右挪两字。
- 目录是 Word 域：`--toc` 写出来是空域，Word 打开时不一定更新（`w:updateFields` 实测只对部分域
  生效），所以收尾时把标题清单填成**缓存条目**；用户按 F9 才补上页码。不要在导出失败时静默
  留下一个只有「目录」二字的空块。

## SVG

- 独立 `<svg>…</svg>`（多行 HTML 块，或整段只有它的单行段落）在编辑器里渲染成图形，
  光标进入该块时退回源码。行内零散 `<svg>` 不处理。
- 检测在 `svg-blocks.ts` 里按文档扫描（StateField 拿不到 viewport），必须跳过围栏代码块。
  只有选区变化时复用上次结果；文档里没有 `<svg` 时任何编辑都不重扫——
  **不要**改回「每次按键全文扫描」，20k 行的文档会掉帧（见 `docs/editing-bugs.md` 的性能预算）。
- 所有行内 HTML 与 SVG 进 DOM 前都要过 `sanitize.ts`；不要用 `innerHTML` 直接塞原始输入。
  清洗器会丢 `script` / `foreignObject` / `on*` / `javascript:` / `file:`，只放行 `data:image/`。

## 测试

- 五层：`analyze.test.ts`（node，纯逻辑）、`view.test.ts`（jsdom + 真实 `EditorView`）、
  `render.test.ts` / `sanitize.test.ts`（jsdom，渲染与清洗）、
  `print.test.ts` / `file-system.test.ts` / `settings.test.ts` / `restore.test.ts`（jsdom，边界逻辑）。
- jsdom 里读 `contentDOM` 之前必须 `forceParsing(view, view.state.doc.length)`，
  否则语法树可能只解析一半，断言随时序抖动。
- 默认 `test.environment` 是 `node`；需要 DOM 的文件用文件头 `// @vitest-environment jsdom`。
- 分页只能靠 PDF 验证：`npm run dev` 后
  `msedge --headless=new --no-pdf-header-footer --print-to-pdf=out.pdf "file:///…/export.html"`，
  检查页边界是否有标题孤行、表头是否在每页重复、长代码是否被截断。
  `?print=1` 适合用截图看版面，不适合判断分页。
- 浏览器里的表现和测试不一致时，先**重启 dev server**：Windows 上 Vite 偶尔漏掉文件变更，
  页面会一直跑旧模块（症状：测试通过但界面少了新装饰）。`vite build` 从磁盘重新读取，不受影响。
- `--dump-dom` 拿不到 React 渲染后的内容；要检查真实 DOM 用 CDP（`Runtime.evaluate`）。

## 未实现（别假设存在）

- 桌面端：代码签名 / 自动更新 / 真正的多窗口（「新建窗口」只是再开一扇窗，会话与草稿仍共用一份）。
- 撤销历史跨文档保留（打开新文件会清空；保留一轮有误改风险，需单独设计）。
- 公式按章节编号；定义列表的嵌套 / 多术语（`Term1` `Term2` + `: 定义`）。`\label` / `\eqref` / `\ref` 已支持。
- 合并单元格；图片上传到图床；导入 Word / ePub / LaTeX。
- 版本历史 / 自动备份；多标签页；云同步。
- 编码：桌面端支持 UTF-8 / UTF-16 / GB18030（BOM → 严格 UTF-8 → GB18030 判定）；其它编码会按 GB18030 解，
  浏览器端只有 UTF-8。
- 自定义快捷键、界面多语言（目前 UI 只有中文）。
- mac / linux：`electron-builder.yml` 里只配了目标，未实际打包验证（mac 还需签名 / 公证）。
- Web 版没有磁盘路径，附件只能内联文件名。
- Mermaid 在编辑器里异步渲染（需要 layout，jsdom 只能验证占位）。
- AI 未做：除 OpenCode / Claude Code 之外的 CLI 运行适配（Codex / Gemini / Qwen / Cursor 只检测）、
  MCP server、`.writara/templates` 占位符替换、审稿意见的行内定位、diff 的「逐句接受」、
  记忆的自动提取（目前只认「记住：…」）。
- 外部 agent 还没有 MCP server：本期用 `.writara/proposals/*.proposal.md` 文件提案（格式见
  `src/ai/proposals.ts`）。不做向量检索 / 索引服务，项目上下文按「项目规范 + 当前文 + 标题」预算。
- 小说只有轻量检查（章节长短），没有结构化设定库（人物 / 时间线 / 伏笔）。
- 项目模式（指令文件 + 资源树 + `.writara/project.json`）见 `docs/project-mode.md`；
  身份、资源树、顺序、合并 / 分章导出、多文件 diff 已实现。未做：`@` 资料引用与上下文预算、
  项目体检（跨文件断链 / 术语）、跨文件大纲、项目级 PNG / Word / ePub 变体。

## 约定

- `tsconfig` 开了 `strict`、`noUncheckedIndexedAccess`、`verbatimModuleSyntax`：
  类型导入必须 `import type`，数组下标按可能 `undefined` 处理。
- ESLint 强制 `@typescript-eslint/consistent-type-imports`。
- 注释与 UI 文案用中文（全角标点），标识符英文。
- **Electron 没有实现 `window.prompt`**：调用会抛 `prompt() is not supported.`，整条流程静默失败
  （`alert` / `confirm` 是可用的）。需要输入文本时用 `components/PromptDialog.tsx`，
  通过 App 的 `askText()` 拿 `Promise<string | null>`；不要再引入 `window.prompt`。
- AI 写入文档只有一条通道：用户点「替换 / 插入」时**一次 dispatch**。不要做「边流边写」，
  否则会撞上 IME 组合期保护；AI 结果里也不要塞任何私有注解（它就是普通 Markdown）。
- 新增菜单项 / 命令只改 `commands/menus.ts`，行为进 `runCommand` 或 `EDITOR_COMMANDS`；
  菜单里不要出现点了没反应的条目（模板子菜单在无模板时必须给 disabled 占位）。
