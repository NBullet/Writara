import { EditorView } from "@codemirror/view";

/**
 * 编辑器的视觉层。颜色全部走 src/styles/tokens.css 的 --wr-* 变量，
 * 因此明暗主题只需改 CSS 变量，不必改这里。
 *
 * 样式对象单独导出：打印样式（PRINT_CSS）必须与这里逐项对齐，
 * 由 src/styles/consistency.test.ts 检查，不能各写一套。
 */
export const EDITOR_STYLE_SPEC = {
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--wr-text)",
    fontSize: "var(--wr-font-size, 17px)",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--wr-font-prose)",
    lineHeight: "var(--wr-lh, 1.7)",
    overflowY: "auto",
    // 原生滚动条在 src/styles/app.css 里全局关掉了（要早于视图创建生效），
    // 由 editor/scrollbar.ts 的自绘指示器替代。
    backgroundColor: "var(--wr-bg)",
  },
  ".cm-scrollbar-track": {
    position: "absolute",
    top: "6px",
    right: "3px",
    bottom: "6px",
    width: "11px",
    zIndex: "15",
    opacity: "0.45",
    transition: "opacity 150ms",
    touchAction: "none",
  },
  ".cm-scrollbar-track:hover": { opacity: "0.85" },
  ".cm-scrollbar-track.is-hidden": { display: "none" },
  ".cm-scrollbar-thumb": {
    position: "absolute",
    left: "2px",
    right: "2px",
    top: "0",
    borderRadius: "5px",
    backgroundColor: "color-mix(in srgb, var(--wr-text) 32%, transparent)",
  },
  ".cm-content": {
    maxWidth: "var(--wr-measure)",
    margin: "0 auto",
    // 文末留白由 `cm-md-bottom-space` 这个块级 widget 提供（见 live-preview/bottom-space.ts）：
    // 它进得了 CodeMirror 的高度表，而 CSS padding 不行。
    padding: "48px 0 0",
    caretColor: "var(--wr-accent)",
  },
  ".cm-line": { padding: "0 4px" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--wr-accent)" },
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection": {
    backgroundColor: "var(--wr-selection)",
  },
  ".cm-placeholder": { color: "var(--wr-muted)" },

  // 即时渲染产物
  // 纵向间距只能用 padding，不能用 margin：
  // CodeMirror 的高度表只量 offsetHeight，line 的 margin 不计入，
  // 会造成「点击位置 → 光标位置」整体下移一行（posAtCoords 偏移）。
  //
  // 标题的「上方空白」由源码里那一行空行提供（数值见 tokens.css 的排版基准），
  // 这里只补标题与下段之间的间隔。不要再加 padding-top：
  // 空行 + 内边距会叠成两倍，就是之前「标题上下有空得离谱」的原因。
  ".cm-md-heading-1": {
    fontSize: "calc(var(--wr-h1, 2) * 1em)",
    fontWeight: "700",
    fontFamily: "var(--wr-font-heading, var(--wr-font-prose))",
    lineHeight: "var(--wr-heading-lh, 1.3)",
    paddingBottom: "var(--wr-heading-bottom, 5px)",
  },
  ".cm-md-heading-2": {
    fontSize: "calc(var(--wr-h2, 1.5) * 1em)",
    fontWeight: "700",
    fontFamily: "var(--wr-font-heading, var(--wr-font-prose))",
    lineHeight: "var(--wr-heading-lh, 1.3)",
    paddingBottom: "var(--wr-heading-bottom, 5px)",
  },
  ".cm-md-heading-3": {
    fontSize: "calc(var(--wr-h3, 1.25) * 1em)",
    fontWeight: "700",
    fontFamily: "var(--wr-font-heading, var(--wr-font-prose))",
    lineHeight: "var(--wr-heading-lh, 1.3)",
    paddingBottom: "var(--wr-heading-bottom, 5px)",
  },
  ".cm-md-heading-4": {
    fontSize: "calc(var(--wr-h4, 1) * 1em)",
    fontWeight: "700",
    fontFamily: "var(--wr-font-heading, var(--wr-font-prose))",
    lineHeight: "var(--wr-heading-lh, 1.3)",
    paddingBottom: "var(--wr-heading-bottom, 5px)",
  },
  ".cm-md-heading-5": {
    fontSize: "calc(var(--wr-h5, 0.875) * 1em)",
    fontWeight: "700",
    fontFamily: "var(--wr-font-heading, var(--wr-font-prose))",
    lineHeight: "var(--wr-heading-lh, 1.3)",
    paddingBottom: "var(--wr-heading-bottom, 5px)",
  },
  ".cm-md-heading-6": {
    fontSize: "calc(var(--wr-h6, 0.85) * 1em)",
    fontWeight: "700",
    fontFamily: "var(--wr-font-heading, var(--wr-font-prose))",
    lineHeight: "var(--wr-heading-lh, 1.3)",
    color: "var(--wr-muted)",
    paddingBottom: "var(--wr-heading-bottom, 5px)",
  },
  ".cm-md-strong": { fontWeight: "700" },
  ".cm-md-em": { fontStyle: "italic" },
  ".cm-md-strike": { textDecoration: "line-through", color: "var(--wr-muted)" },
  ".cm-md-mark": {
    backgroundColor: "var(--wr-mark-bg, #f6e6b8b3)",
    borderRadius: "3px",
    padding: "0 0.15em",
    // 高亮只是底色，不要任何字形变化：PDF 里也一样（否则同一段字两副样子）
    fontStyle: "normal",
  },
  ".cm-md-sub": { fontSize: "0.8em", verticalAlign: "sub" },
  ".cm-md-sup": { fontSize: "0.8em", verticalAlign: "super" },
  ".cm-md-fn": { color: "var(--wr-link)", fontSize: "0.75em", verticalAlign: "super" },
  ".cm-md-math": {
    display: "inline-block",
    padding: "0 1px",
  },
  ".cm-md-math.is-error": {
    color: "var(--wr-accent)",
    fontFamily: "var(--wr-font-mono)",
    fontSize: "0.9em",
  },
  ".cm-md-math-block": {
    padding: "0.4em 0",
    overflowX: "auto",
  },
  // 公式块的编辑态：源码留在原位（围栏行弱化），块后挂预览面板。
  // 行高必须与正文一致：CodeMirror 用它估算未渲染行（editing-bugs.md #22）。
  ".cm-md-math-edit": {
    fontFamily: "var(--wr-font-mono)",
    fontSize: "var(--wr-code-size, 0.9em)",
    lineHeight: "calc(var(--wr-font-size, 17px) * var(--wr-lh, 1.7))",
    backgroundColor: "color-mix(in srgb, var(--wr-code-bg) 60%, transparent)",
    paddingLeft: "0.8em",
    borderLeft: "2px solid color-mix(in srgb, var(--wr-accent) 45%, transparent)",
  },
  ".cm-md-math-fence": {
    color: "var(--wr-muted)",
  },
  // 编辑态下方的预览面板（公式 / 图表共用）。纵向间距只用 padding：
  // margin 不进 offsetHeight，会让块级 widget 的高度测量失真。
  ".cm-md-block-preview": {
    padding: "6px 0 8px",
  },
  ".cm-md-preview-frame": {
    border: "1px solid var(--wr-border)",
    borderRadius: "6px",
    backgroundColor: "color-mix(in srgb, var(--wr-border) 12%, transparent)",
    overflow: "hidden",
  },
  ".cm-md-preview-head": {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "3px 8px",
    borderBottom: "1px solid color-mix(in srgb, var(--wr-border) 60%, transparent)",
    fontSize: "0.72em",
    color: "var(--wr-muted)",
  },
  ".cm-md-preview-label": { letterSpacing: "0.02em" },
  ".cm-md-preview-status": { fontSize: "0.95em" },
  ".cm-md-preview-done": {
    marginLeft: "auto",
    padding: "0 6px",
    border: "1px solid var(--wr-border)",
    borderRadius: "4px",
    background: "var(--wr-bg)",
    color: "var(--wr-text)",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-md-preview-done:hover": {
    backgroundColor: "color-mix(in srgb, var(--wr-text) 8%, transparent)",
  },
  ".cm-md-preview-body": {
    padding: "0.5em 0.7em",
    overflowX: "auto",
    fontSize: "0.94em",
  },
  ".cm-md-preview-body.is-error": {
    color: "var(--wr-accent)",
    fontFamily: "var(--wr-font-mono)",
    fontSize: "0.85em",
  },
  ".cm-md-preview-body .katex-display": { margin: "0" },
  ".cm-md-mermaid-preview .cm-md-preview-body svg": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
    margin: "0 auto",
  },
  '.cm-md-block-preview[data-state="pending"] .cm-md-preview-body': { opacity: "0.55" },
  '.cm-md-block-preview[data-state="error"] .cm-md-preview-status': { color: "var(--wr-accent)" },
  ".cm-md-mermaid": {
    padding: "0.5em 0",
    maxWidth: "100%",
    overflow: "hidden",
  },
  ".cm-md-mermaid svg": {
    maxWidth: "100%",
    height: "auto",
  },
  ".cm-md-mermaid.is-loading": {
    color: "var(--wr-muted)",
    fontSize: "0.9em",
  },
  ".cm-md-mermaid.is-error": {
    color: "var(--wr-accent)",
    fontSize: "0.9em",
  },
  ".cm-md-code": {
    fontFamily: "var(--wr-font-mono)",
    fontSize: "var(--wr-code-size, 0.9em)",
    backgroundColor: "var(--wr-code-bg)",
    borderRadius: "4px",
    padding: "0.15em 0.35em",
  },
  ".cm-md-link": { color: "var(--wr-link)", textDecoration: "underline", textUnderlineOffset: "0.2em" },
  // 附件链接：文件名胶囊，点击用系统程序打开
  ".cm-md-attachment": {
    display: "inline",
    padding: "1px 6px",
    borderRadius: "4px",
    backgroundColor: "color-mix(in srgb, var(--wr-link) 12%, transparent)",
    textDecoration: "none",
  },
  ".cm-md-attachment::before": {
    content: '"\\1F4CE"',
    marginRight: "4px",
    fontSize: "0.9em",
  },
  ".cm-md-quote": {
    borderLeft: "3px solid var(--wr-border)",
    paddingLeft: "1em",
    color: "var(--wr-muted)",
  },
  // 元信息行（链接引用定义等）：打印不输出，编辑器里弱化，不抢正文
  ".cm-md-meta": {
    color: "var(--wr-muted)",
    fontFamily: "var(--wr-font-mono)",
    fontSize: "0.82em",
  },
  ".cm-md-hr": {
    // 用居中的 1px 背景线代替 border + margin：margin 不计入 CM 的高度表。
    padding: "0.9em 0",
    backgroundImage: "linear-gradient(var(--wr-border), var(--wr-border))",
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
    backgroundSize: "100% 1px",
  },
  // 定义列表：术语加粗、解释缩进。与打印的 dt / dd 用同一组值（consistency.test.ts 比对）。
  ".cm-md-def-term": {
    fontWeight: "700",
  },
  ".cm-md-def-detail": {
    paddingLeft: "1.6em",
  },
  ".cm-md-codeblock": {
    backgroundColor: "var(--wr-code-bg)",
    fontFamily: "var(--wr-font-mono)",
    // 行盒高度必须与正文一致：CM 会挑一条「纯 ASCII 且较短」的行量化 lineHeight，
    // 再用它估算所有未渲染行；代码块更矮会让全局估算变小，滚动时被钳制（往回缩）。
    // 字号用排版基准里的代码字号，行高换算回正文行高，行盒才不会显得空。
    fontSize: "var(--wr-code-size, 0.9em)",
    lineHeight: "calc(var(--wr-font-size, 17px) * var(--wr-lh, 1.7))",
  },
  ".cm-md-code-fence": {
    textAlign: "right",
    lineHeight: "calc(var(--wr-font-size, 17px) * var(--wr-lh, 1.7))",
    // 围栏行只剩一个空白行盒（``` 与语言名都被隐藏）：它承担代码块的上下内边距。
    // 行盒不能压矮 —— CodeMirror 的高度表要它和正文等高（见 editing-bugs.md #22）。
    backgroundColor: "var(--wr-code-bg)",
  },
  ".cm-md-code-fence-open": {
    borderTopLeftRadius: "6px",
    borderTopRightRadius: "6px",
  },
  ".cm-md-code-fence-close": {
    borderBottomLeftRadius: "6px",
    borderBottomRightRadius: "6px",
  },
  ".cm-md-lang": {    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "0 2px",
    color: "var(--wr-muted)",
    fontFamily: "var(--wr-font-mono)",
    fontSize: "0.72em",
    letterSpacing: "0.02em",
  },
  ".cm-md-copy": {
    padding: "0 5px",
    border: "none",
    borderRadius: "3px",
    background: "none",
    color: "var(--wr-muted)",
    font: "inherit",
    cursor: "pointer",
  },
  ".cm-md-copy:hover": {
    background: "color-mix(in srgb, var(--wr-text) 10%, transparent)",
    color: "var(--wr-text)",
  },
  // 代码块行号（仅当设置开启时才会挂这个 gutter）
  ".cm-code-gutter": {
    width: "2.6ch",
    minWidth: "2.6ch",
    color: "var(--wr-muted)",
    fontSize: "0.72em",
    userSelect: "none",
  },
  ".cm-code-gutter .cm-gutterElement": {
    padding: "0 6px 0 0",
    textAlign: "right",
  },
  ".cm-find-match": {
    backgroundColor: "color-mix(in srgb, var(--wr-accent) 18%, transparent)",
    borderRadius: "2px",
  },
  ".cm-find-match-current": {
    backgroundColor: "color-mix(in srgb, var(--wr-accent) 38%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--wr-accent) 55%, transparent)",
  },
  // 反 AI 腔标记：套话 / emoji / 列表腔 / 收尾段。
  // 颜色全部由 --wr-bad 派生（主题自动跟随），不改字号与行高（高度表要稳）。
  ".cm-slop-mark": {
    backgroundColor: "color-mix(in srgb, var(--wr-bad) 13%, transparent)",
    borderBottom: "1px dashed color-mix(in srgb, var(--wr-bad) 55%, transparent)",
    borderRadius: "2px",
    cursor: "help",
  },
  ".cm-slop-mark.is-tail": {
    backgroundColor: "color-mix(in srgb, var(--wr-bad) 9%, transparent)",
    textDecoration: "line-through",
    textDecorationColor: "color-mix(in srgb, var(--wr-bad) 45%, transparent)",
  },
  ".cm-md-svg": {
    padding: "0.5em 0",
  },
  ".cm-md-svg svg": {
    display: "block",
    maxWidth: "100%",
    height: "auto",
  },
  ".cm-md-table": {
    position: "relative",
    padding: "0.45em 0",
  },
  ".cm-md-table table": {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "0.92em",
    lineHeight: "1.6",
  },
  // 拖过列宽的表格（分隔行横线数不等）：固定布局才让百分比生效，与打印端一致。
  ".cm-md-table table.wr-fixed": {
    tableLayout: "fixed",
  },
  ".cm-md-table th, .cm-md-table td": {
    padding: "0.35em 0.6em",
    border: "1px solid var(--wr-border)",
    verticalAlign: "top",
    cursor: "text",
  },
  ".cm-md-table th": {
    background: "color-mix(in srgb, var(--wr-border) 32%, transparent)",
    fontWeight: "600",
    textAlign: "left",
    // 列宽拖拽手柄贴在这一格的右边界上（绝对定位，不量布局）
    position: "relative",
  },
  ".cm-md-col-resize": {
    position: "absolute",
    top: "0",
    right: "-4px",
    width: "8px",
    height: "100%",
    cursor: "col-resize",
    zIndex: "3",
  },
  ".cm-md-col-resize:hover, .cm-md-table.is-resizing .cm-md-col-resize": {
    background: "color-mix(in srgb, var(--wr-accent) 45%, transparent)",
  },
  ".cm-md-table p": {
    margin: "0",
  },
  ".cm-md-table .wr-align-left": { textAlign: "left" },
  ".cm-md-table .wr-align-center": { textAlign: "center" },
  ".cm-md-table .wr-align-right": { textAlign: "right" },
  // 表格工具条：焦点驱动的等价物。单元格点击不会把光标送进表内（块级 widget 放不下），
  // 所以用 hover / 浮层聚焦来露出；绝对定位，不参与高度表。
  ".cm-md-table-toolbar": {
    position: "absolute",
    top: "-24px",
    right: "0",
    zIndex: "5",
    display: "flex",
    alignItems: "center",
    gap: "2px",
    padding: "2px 4px",
    border: "1px solid var(--wr-border)",
    borderRadius: "6px",
    backgroundColor: "var(--wr-bg)",
    boxShadow: "0 2px 8px color-mix(in srgb, var(--wr-text) 12%, transparent)",
    fontSize: "0.72em",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity 120ms",
  },
  ".cm-md-table:hover .cm-md-table-toolbar, .cm-md-table:focus-within .cm-md-table-toolbar": {
    opacity: "1",
    pointerEvents: "auto",
  },
  ".cm-md-tb": {
    padding: "0 5px",
    border: "none",
    borderRadius: "4px",
    background: "none",
    color: "var(--wr-muted)",
    font: "inherit",
    fontSize: "0.95em",
    lineHeight: "1.7",
    cursor: "pointer",
  },
  ".cm-md-tb:hover": {
    backgroundColor: "color-mix(in srgb, var(--wr-text) 9%, transparent)",
    color: "var(--wr-text)",
  },
  '.cm-md-tb[aria-pressed="true"]': {
    backgroundColor: "color-mix(in srgb, var(--wr-accent) 16%, transparent)",
    color: "var(--wr-text)",
  },
  ".cm-md-tb-sep": {
    width: "1px",
    height: "12px",
    margin: "0 2px",
    backgroundColor: "var(--wr-border)",
  },
  // 图片浮条：挂在 .cm-editor 上（图片聚焦后 widget 已经不在 DOM 里），
  // 必须 fixed，否则会作为普通块把编辑器撑高。
  ".cm-md-image-toolbar": {
    position: "fixed",
    zIndex: "40",
    alignItems: "center",
    gap: "2px",
    padding: "2px 4px",
    border: "1px solid var(--wr-border)",
    borderRadius: "6px",
    backgroundColor: "var(--wr-bg)",
    boxShadow: "0 2px 8px color-mix(in srgb, var(--wr-text) 12%, transparent)",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },
  ".cm-md-it-label": {
    padding: "0 4px 0 2px",
    color: "var(--wr-muted)",
    fontSize: "0.92em",
  },
  // AI 选区浮条：复用图片浮条的定位手法（fixed、更新周期外读坐标），z 分量同档
  ".cm-md-ai-bar": {
    position: "fixed",
    zIndex: "var(--wr-z-float)",
    alignItems: "center",
    gap: "2px",
    padding: "2px 4px",
    border: "1px solid var(--wr-border)",
    borderRadius: "6px",
    backgroundColor: "var(--wr-bg)",
    boxShadow: "0 2px 8px color-mix(in srgb, var(--wr-text) 12%, transparent)",
    fontSize: "12px",
    whiteSpace: "nowrap",
  },
  ".cm-md-ai-bar .cm-md-tb": {
    color: "var(--wr-accent)",
  },
  ".cm-md-cell-editor": {
    position: "absolute",
    zIndex: "6",
    boxSizing: "border-box",
    margin: "0",
    // 与 th/td 的水平内边距对齐，输入时文字不会贴到边框
    padding: "0 0.6em",
    border: "1px solid var(--wr-accent)",
    borderRadius: "3px",
    outline: "none",
    backgroundColor: "var(--wr-bg)",
    color: "var(--wr-text)",
    fontFamily: "inherit",
    fontSize: "0.92em",
    lineHeight: "1.4",
  },
  ".cm-md-toc": {
    position: "relative",
    margin: "0",
    padding: "0.8em 0.9em",
    border: "1px solid var(--wr-border)",
    borderRadius: "6px",
    background: "color-mix(in srgb, var(--wr-border) 18%, transparent)",
    fontSize: "0.94em",
  },
  // 目录悬浮工具条（与表格工具条同一套观感）
  ".cm-md-toc-tools": {
    position: "absolute",
    top: "-24px",
    right: "0",
    zIndex: "5",
    display: "flex",
    alignItems: "center",
    gap: "2px",
    padding: "2px 4px",
    border: "1px solid var(--wr-border)",
    borderRadius: "6px",
    backgroundColor: "var(--wr-bg)",
    boxShadow: "0 2px 8px color-mix(in srgb, var(--wr-text) 12%, transparent)",
    opacity: "0",
    pointerEvents: "none",
    transition: "opacity 120ms",
  },
  ".cm-md-toc:hover .cm-md-toc-tools, .cm-md-toc:focus-within .cm-md-toc-tools": {
    opacity: "1",
    pointerEvents: "auto",
  },
  ".cm-md-toc ul": { margin: "0", padding: "0", listStyle: "none" },
  ".cm-md-toc li": { margin: "0.1em 0" },
  ".cm-md-toc button": {
    width: "100%",
    padding: "1px 4px",
    border: "none",
    borderRadius: "4px",
    background: "none",
    color: "var(--wr-text)",
    font: "inherit",
    textAlign: "left",
    cursor: "pointer",
  },
  ".cm-md-toc button:hover": { background: "color-mix(in srgb, var(--wr-text) 7%, transparent)" },
  ".cm-md-toc .lv2": { paddingLeft: "1em" },
  ".cm-md-toc .lv3": { paddingLeft: "2em" },
  ".cm-md-toc .lv4": { paddingLeft: "3em" },
  ".cm-md-toc .lv5": { paddingLeft: "4em" },
  ".cm-md-toc .lv6": { paddingLeft: "5em" },
  ".cm-md-image": {
    display: "inline-block",
    verticalAlign: "middle",
    // 右下角的缩放手柄要靠它定位
    position: "relative",
  },
  ".cm-md-image img": {
    maxWidth: "100%",
    maxHeight: "60vh",
    borderRadius: "4px",
    verticalAlign: "middle",
  },
  // 图片缩放手柄：悬停才出现，拖动时写回 `=宽`（与浮条同一套尺寸语法）。
  ".cm-md-image-resize": {
    position: "absolute",
    right: "-5px",
    bottom: "-5px",
    width: "12px",
    height: "12px",
    borderRadius: "3px",
    border: "1.5px solid var(--wr-bg)",
    backgroundColor: "var(--wr-accent)",
    cursor: "nwse-resize",
    opacity: "0",
    transition: "opacity 120ms ease",
  },
  ".cm-md-image:hover .cm-md-image-resize, .cm-md-image.is-resizing .cm-md-image-resize": {
    opacity: "1",
  },
  ".cm-md-image.is-error, .cm-md-image.is-blocked, .cm-md-image.is-missing": {
    padding: "0 6px",
    border: "1px dashed var(--wr-border)",
    borderRadius: "4px",
    color: "var(--wr-muted)",
    fontSize: "0.9em",
  },
  ".cm-md-task": {
    display: "inline-block",
    width: "1.15em",
    marginRight: "0.1em",
    color: "var(--wr-link)",
    // 与打印端同一套字体：符号字形不同会让方框大小看着不一样
    fontFamily: '"Segoe UI Symbol", "Noto Sans Symbols 2", sans-serif',
    cursor: "pointer",
    userSelect: "none",
  },
  ".cm-md-task.is-checked": {
    color: "var(--wr-accent)",
  },
  // 无序列表的圆点：只占自身宽度，别把后面的文字推太远
  ".cm-md-bullet": {
    display: "inline-block",
    marginRight: "0.15em",
    color: "var(--wr-text)",
    userSelect: "none",
  },
  ".cm-panels": {
    backgroundColor: "var(--wr-surface)",
    color: "var(--wr-text)",
    borderBottom: "1px solid var(--wr-border)",
  },
  ".cm-panels.cm-panels-bottom": {
    borderTop: "1px solid var(--wr-border)",
    borderBottom: "none",
  },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in srgb, var(--wr-accent) 18%, transparent)",
    outline: "none",
  },
  ".cm-searchMatch.cm-searchMatch-selected": {
    backgroundColor: "color-mix(in srgb, var(--wr-accent) 38%, transparent)",
  },
  ".cm-panel.cm-search input, .cm-panel.cm-search button, .cm-panel.cm-search label": {
    fontFamily: "var(--wr-font-ui)",
    fontSize: "12px",
  },

  // 源码状态下的标记弱化
  ".cm-md-hidden-mark": { opacity: "0" },
  ".cm-md-frontmatter": {
    backgroundColor: "color-mix(in srgb, var(--wr-border) 25%, transparent)",
    color: "var(--wr-muted)",
    fontFamily: "var(--wr-font-mono)",
    fontSize: "0.82em",
  },
  // Front matter 的折叠摘要（阅读态）：一行 chips，点开才是原始 YAML
  ".cm-md-meta-summary": {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: "6px",
    padding: "4px 8px",
    borderRadius: "6px",
    backgroundColor: "color-mix(in srgb, var(--wr-border) 22%, transparent)",
    color: "var(--wr-muted)",
    fontSize: "0.84em",
    cursor: "text",
  },
  ".cm-md-meta-label": {
    padding: "0 4px",
    borderRadius: "4px",
    backgroundColor: "color-mix(in srgb, var(--wr-text) 8%, transparent)",
    fontSize: "0.92em",
  },
  ".cm-md-meta-chip": {
    display: "inline-flex",
    alignItems: "baseline",
    gap: "4px",
    minWidth: "0",
    maxWidth: "100%",
  },
  ".cm-md-meta-key": { color: "var(--wr-muted)", opacity: "0.8" },
  ".cm-md-meta-key::after": { content: '"·"', marginLeft: "2px", opacity: "0.6" },
  ".cm-md-meta-value": {
    overflow: "hidden",
    color: "var(--wr-text)",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  ".cm-md-meta-more": { color: "var(--wr-muted)", opacity: "0.8" },
  ".cm-md-meta-empty": { color: "var(--wr-muted)" },
  // SVG 编辑态：等宽 + 左侧色条（与公式块一致），块后挂预览
  ".cm-md-svg-edit": {
    fontFamily: "var(--wr-font-mono)",
    fontSize: "var(--wr-code-size, 0.9em)",
    lineHeight: "calc(var(--wr-font-size, 17px) * var(--wr-lh, 1.7))",
    backgroundColor: "color-mix(in srgb, var(--wr-code-bg) 60%, transparent)",
    paddingLeft: "0.8em",
    borderLeft: "2px solid color-mix(in srgb, var(--wr-accent) 45%, transparent)",
  },
  "&.cm-source-mode .cm-content": {
    fontFamily: "var(--wr-font-mono)",
    fontSize: "0.92em",
    lineHeight: "1.7",
  },
  "&.cm-focus .cm-line": {
    opacity: "0.32",
    transition: "opacity 120ms ease",
  },
  "&.cm-focus .cm-line.cm-md-active-line": {
    opacity: "1",
  },
};

export const writaraTheme = EditorView.theme(EDITOR_STYLE_SPEC);
