/**
 * 打印 / 导出用的排版样式。
 *
 * 为什么是 TS 字符串而不是 .css 文件：
 * 导出的单文件 HTML 需要把整份样式内联进去，而 `?raw` 导入在测试环境会拿到空字符串，
 * 让「导出样式缺失」这类问题只能在浏览器里才发现。放成字符串则构建、测试、导出完全一致。
 *
 * 内联时不要依赖站点 CSS 变量，颜色全部写死。
 */
export const PRINT_CSS = `/*
 * 打印 / 导出用的排版样式。独立于 app.css：
 * 导出 HTML 会把这份文件内联进去，所以这里不能依赖站点的 CSS 变量。
 */

/* 兜底：真正生效的是 page.ts 算出来的那一条（同一份样式里后写的 @page 覆盖这里）。 */
@page {
  size: A4;
  margin: 20mm 16mm 22mm 16mm;
}

.wr-doc {
  /* 颜色全部取自应用主题变量；导出时会把当前主题的变量内联进 HTML。 */
  color: var(--wr-text, #26221d);
  background: var(--wr-bg, #ffffff);
  font-family: var(--wr-font-prose, "Segoe UI", "Microsoft YaHei", "PingFang SC",
    sans-serif);
  /* 字号与栏宽由 page.ts 按「纸张内容宽 vs 编辑器栏宽」算出来注入；
     fallback 只是没有注入时的兜底。 */
  font-size: var(--wr-print-font-size, 16px);
  /*
   * 排版基准里的两个间距，按「正文」字号算成 px 再往下传：
   * em 在标题上会按标题字号放大，标题越大上下越空——之前标题空得离谱就是这个原因。
   */
  --block-gap: calc(var(--wr-font-size, 16px) * var(--wr-lh, 1.7));
  --head-gap: var(--wr-heading-bottom, calc(var(--wr-font-size, 16px) * var(--wr-heading-ratio, 0.3)));
  line-height: var(--wr-lh, 1.7);
  overflow-wrap: break-word;
  word-break: normal;
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

/* 深色主题打印时整页跟随，避免内容区深、页边距白。 */
@media print {
  html,
  body {
    background: var(--wr-bg, #ffffff) !important;
  }
}

.wr-doc > :first-child {
  margin-top: 0;
}

/*
 * 块间距 = 编辑器里那条空行（排版基准的 --wr-block-gap）。
 * 不要在这里另写 0.85em / 1.15em 之类的数字：屏幕上是空行、纸上是 margin，
 * 两者必须是同一个值，否则同一份文档两副样子。
 */
.wr-doc p,
.wr-doc ul,
.wr-doc ol,
.wr-doc dl.wr-dl,
.wr-doc pre,
.wr-doc table,
.wr-doc blockquote,
.wr-doc figure,
.wr-doc .wr-toc,
.wr-doc .wr-mermaid {
  margin: 0 0 var(--block-gap);
}

/*
 * 标题：上方的一行空行由上一块的 margin 提供（相邻 margin 取最大值，不会叠加），
 * 这里只补标题与下段之间的间隔。字号阶梯见 tokens.css。
 */
.wr-doc h1,
.wr-doc h2,
.wr-doc h3,
.wr-doc h4,
.wr-doc h5,
.wr-doc h6 {
  margin: 0 0 var(--head-gap);
  font-weight: 700;
  font-family: var(--wr-font-heading, var(--wr-font-prose));
  line-height: var(--wr-heading-lh, 1.3);
  break-after: avoid-page;
  page-break-after: avoid;
  break-inside: avoid;
}

.wr-doc h1 { font-size: calc(var(--wr-h1, 2) * 1em); }
.wr-doc h2 { font-size: calc(var(--wr-h2, 1.5) * 1em); }
.wr-doc h3 { font-size: calc(var(--wr-h3, 1.25) * 1em); }
.wr-doc h4 { font-size: calc(var(--wr-h4, 1) * 1em); }
.wr-doc h5 { font-size: calc(var(--wr-h5, 0.875) * 1em); }

.wr-doc h6 {
  font-size: calc(var(--wr-h6, 0.85) * 1em);
  color: var(--wr-muted, #6b6459);
}

.wr-doc p {
  orphans: 3;
  widows: 3;
}

/*
 * 定义列表：术语加粗、解释缩进 1.6em。
 * 编辑器里由 .cm-md-def-term / .cm-md-def-detail 提供同一组值（consistency.test.ts 比对）。
 */
.wr-doc dl.wr-dl {
  margin-bottom: var(--block-gap);
}

.wr-doc dl.wr-dl dt {
  /* 与编辑器 .cm-md-def-term 一致；serif 字体没有 semibold，600 看起来仍然是常规字重 */
  font-weight: 700;
}

.wr-doc dl.wr-dl dd {
  margin: 0;
  margin-left: 1.6em;
}

/*
 * 标题后面的空行：编辑器里那是一整行看得见的空白，打印没有行，
 * 所以在「标题 + 下一块」这组里把同样的距离补出来
 * （上一块与标题之间的空行已经由块间距对上，不用重复处理）。
 */
.wr-doc .wr-gap > :first-child {
  margin-bottom: 0;
}

.wr-doc .wr-gap > :last-child {
  margin-top: calc(var(--block-gap) + var(--head-gap));
}

.wr-doc strong,
.wr-doc b {
  font-weight: 700;
}

.wr-doc em,
.wr-doc i {
  font-style: italic;
}

.wr-doc del,
.wr-doc s {
  color: var(--wr-muted, #6b6459);
}

.wr-doc mark {
  background: var(--wr-mark-bg, #f6e6b8b3);
  border-radius: 3px;
  padding: 0 0.15em;
  font-style: normal;
}

.wr-doc sub,
.wr-doc sup {
  font-size: 0.8em;
  line-height: 0;
}

/* 脚注 */
.wr-doc .wr-fn-ref {
  font-size: 0.75em;
  line-height: 0;
}

.wr-doc .wr-fn-ref a {
  color: var(--wr-link, #2f6f8f);
  text-decoration: none;
}

.wr-doc .wr-footnotes {
  margin-top: 2.2em;
  color: var(--wr-muted, #6b6459);
  font-size: 0.88em;
}

.wr-doc .wr-footnotes hr {
  margin: 0 0 1em;
}

.wr-doc .wr-footnotes ol {
  margin: 0;
  padding-left: 1.4em;
}

.wr-doc .wr-footnotes li {
  margin: 0.25em 0;
  break-inside: avoid;
}

.wr-doc .wr-footnotes p {
  margin: 0;
}

.wr-doc .wr-fn-back {
  margin-left: 0.35em;
  color: var(--wr-muted);
  text-decoration: none;
}

.wr-doc a {
  color: var(--wr-link, #2f6f8f);
  /* 与编辑器一致：链接带下划线，否则纸上分不出哪些是可点的文字 */
  text-decoration: underline;
  text-underline-offset: 0.2em;
}

.wr-doc code {
  padding: 0.15em 0.35em;
  border-radius: 4px;
  background: var(--wr-code-bg, #f4f1e9);
  font-family: "JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace;
  font-size: var(--wr-code-size, 0.9em);
}

.wr-doc pre {
  padding: 0 4px;
  border-radius: 0;
  background: var(--wr-code-bg, #f4f1e9);
  font-size: var(--wr-code-size, 0.9em);
  /* 行盒与正文等高（= 正文行高 / 代码字号），代码块与正文的行距才对得上 */
  line-height: calc(var(--wr-lh, 1.7) / var(--wr-code-scale, 0.9));
  /* 代码块尽量整块保留；超过一页时浏览器会自动拆页 */
  break-inside: avoid;
  page-break-inside: avoid;
  /* 打印时不能横向滚动，长行必须折行 */
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.wr-doc pre code {
  padding: 0;
  background: none;
  font-size: 1em;
}

/* highlight.js token 颜色（打印版，浅色） */
.wr-doc .hljs-keyword,
.wr-doc .hljs-selector-tag,
.wr-doc .hljs-built_in,
.wr-doc .hljs-type {
  color: var(--wr-accent, #a63d24);
}

.wr-doc .hljs-string,
.wr-doc .hljs-attr,
.wr-doc .hljs-template-variable {
  color: var(--wr-link, #2f6f8f);
}

.wr-doc .hljs-comment,
.wr-doc .hljs-quote {
  color: var(--wr-muted, #8a8175);
  font-style: italic;
}

.wr-doc .hljs-number,
.wr-doc .hljs-literal,
.wr-doc .hljs-symbol {
  color: color-mix(in srgb, var(--wr-accent, #a63d24) 70%, var(--wr-text, #26221d));
}

.wr-doc .hljs-title,
.wr-doc .hljs-section,
.wr-doc .hljs-name {
  color: var(--wr-text, #26221d);
  font-weight: 600;
}

.wr-doc .hljs-variable,
.wr-doc .hljs-params,
.wr-doc .hljs-property {
  color: inherit;
}

.wr-doc blockquote {
  padding-left: 1em;
  border-left: 3px solid var(--wr-border, #ddd7ca);
  color: var(--wr-muted, #6b6459);
  break-inside: avoid;
  page-break-inside: avoid;
}

.wr-doc blockquote > :last-child {
  margin-bottom: 0;
}

/* 无序列表：符号与编辑器完全一致（• ◦ ▪），不用浏览器自带的 disc/circle/square ——
   自带符号由字体决定，不同字体的圆点大小差得肉眼可见。 */
.wr-doc ul {
  padding-left: 0;
  list-style: none;
}

.wr-doc ul > li {
  position: relative;
  padding-left: 0.75em;
}

.wr-doc ul > li::before {
  content: "•";
  position: absolute;
  left: 0;
  top: 0;
}

.wr-doc ul ul > li::before {
  content: "◦";
}

.wr-doc ul ul ul > li::before {
  content: "▪";
}

.wr-doc ol {
  padding-left: var(--wr-list-indent, 1.6em);
}

.wr-doc li {
  margin: 0;
}

.wr-doc li > p {
  margin: 0;
}

/* 松散列表（项之间有空行）在编辑器里也是一行空行，这里用同一个值还原 */
.wr-doc .wr-loose li > p {
  margin: 0 0 var(--block-gap);
}

.wr-doc li > ul,
.wr-doc li > ol {
  margin: 0;
}

/* 任务列表：用字符代替表单控件，打印结果稳定。
   与编辑器一致：方框在行首，不缩进、也没有圆点。 */
.wr-doc ul > li:has(> .wr-task) {
  padding-left: 0;
  list-style: none;
}

.wr-doc ul > li:has(> .wr-task)::before {
  content: none;
}

.wr-doc .wr-task {
  margin: 0;
}

.wr-doc .wr-task-box {
  display: inline-block;
  width: 1.15em;
  margin-right: 0.1em;
  color: var(--wr-link, #2f6f8f);
  font-family: "Segoe UI Symbol", "Noto Sans Symbols 2", sans-serif;
}

.wr-doc .wr-task-box.is-checked {
  color: var(--wr-accent, #b4472e);
}

.wr-doc table {
  width: 100%;
  padding: 0.45em 0;
  border-collapse: collapse;
  font-size: 0.92em;
  line-height: 1.6;
  break-inside: avoid;
  page-break-inside: avoid;
}

/* 拖过列宽的表格：按分隔行算出的百分比铺列，屏幕与纸面同一套宽度。 */
.wr-doc table.wr-fixed {
  table-layout: fixed;
}

.wr-doc thead {
  display: table-header-group; /* 跨页时重复表头 */
}

.wr-doc tfoot {
  display: table-footer-group;
}

.wr-doc tr {
  break-inside: avoid;
  page-break-inside: avoid;
}

.wr-doc th,
.wr-doc td {
  padding: 0.35em 0.6em;
  border: 1px solid var(--wr-border, #ddd7ca);
  vertical-align: top;
}

.wr-doc th {
  background: color-mix(in srgb, var(--wr-border, #ddd7ca) 32%, transparent);
  /* 与编辑器表格的 th 权重一致（theme.ts 里是 600） */
  font-weight: 600;
  text-align: left;
}

.wr-doc .wr-align-left {
  text-align: left;
}

.wr-doc .wr-align-center {
  text-align: center;
}

.wr-doc .wr-align-right {
  text-align: right;
}

.wr-doc hr {
  margin: 0 0 var(--block-gap);
  padding: 0.9em 0;
  border: none;
  background-image: linear-gradient(var(--wr-border, #ddd7ca), var(--wr-border, #ddd7ca));
  background-repeat: no-repeat;
  background-position: center;
  background-size: 100% 1px;
}

.wr-doc img,
.wr-doc svg {
  max-width: 100%;
  height: auto;
}

.wr-doc img {
  break-inside: avoid;
}

.wr-doc > svg,
.wr-doc .wr-keep > svg {
  display: block;
  padding: 0.5em 0;
  margin: 0 auto var(--block-gap);
}

.wr-doc figure {
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}

.wr-doc figure img,
.wr-doc figure svg {
  display: block;
  margin: 0 auto;
}

.wr-doc figcaption {
  margin-top: 0.5em;
  color: var(--wr-muted, #6b6459);
  font-size: 0.85em;
}

.wr-doc kbd {
  padding: 0.1em 0.35em;
  border: 1px solid var(--wr-border, #ddd7ca);
  border-radius: 4px;
  background: color-mix(in srgb, var(--wr-text, #26221d) 6%, var(--wr-bg, #fff));
  font-family: "JetBrains Mono", "Cascadia Code", Consolas, monospace;
  font-size: 0.82em;
}

.wr-doc details {
  margin: 0 0 1em;
}

.wr-doc summary {
  cursor: default;
  font-weight: 700;
}

/* 标题 + 紧随其后的块：整组不跨页，避免标题孤立在页尾 */
.wr-doc .wr-keep {
  break-inside: avoid;
  page-break-inside: avoid;
}

/* 超过一页的块由打印前的测量脚本打上 wr-split，允许正常拆页 */
.wr-doc .wr-split {
  break-inside: auto;
  page-break-inside: auto;
}

/* 目录 */
.wr-doc .wr-toc {
  padding: 0.8em 0.9em;
  border: 1px solid var(--wr-border, #ddd7ca);
  border-radius: 6px;
  background: color-mix(in srgb, var(--wr-border, #ddd7ca) 18%, transparent);
  font-size: 0.94em;
  break-inside: avoid;
  page-break-inside: avoid;
}

.wr-doc .wr-toc ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.wr-doc .wr-toc li {
  margin: 0.1em 0;
}

/* 目录是 ul，但不要项目符号，也不要列表缩进 */
.wr-doc .wr-toc ul > li {
  padding-left: 0;
}

.wr-doc .wr-toc ul > li::before {
  content: none;
}

/* 目录条目是链接，但编辑器里不画下划线（是整块可点的条目），纸上也一样 */
.wr-doc .wr-toc a {
  text-decoration: none;
}

.wr-doc .wr-toc a {
  color: var(--wr-text, #26221d);
}

.wr-doc .wr-toc .wr-toc-2 { padding-left: 1.1em; }
.wr-doc .wr-toc .wr-toc-3 { padding-left: 2.2em; }
.wr-doc .wr-toc .wr-toc-4 { padding-left: 3.3em; }
.wr-doc .wr-toc .wr-toc-5,
.wr-doc .wr-toc .wr-toc-6 { padding-left: 4.4em; }

/* 公式 */
.wr-doc .wr-math-block {
  padding: 0.4em 0;
  margin: 0 0 var(--block-gap);
  overflow-x: auto;
  break-inside: avoid;
}

.wr-doc .wr-math-block .katex-display {
  margin: 0;
}

.wr-doc .katex {
  font-size: 1.05em;
}

/* Mermaid 图表 */
.wr-doc .wr-mermaid {
  padding: 0.5em 0;
  text-align: center;
  break-inside: avoid;
  page-break-inside: avoid;
}

.wr-doc .wr-mermaid svg {
  max-width: 100%;
  height: auto;
}

/* 显式分页：<!-- pagebreak --> */
.wr-doc .wr-page-break {
  height: 0;
  margin: 0;
  border: none;
  break-after: page;
  page-break-after: always;
}
`;
