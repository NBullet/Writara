export const SAMPLE_DOC = `# Writara｜文叙

> Write naturally, render instantly.
> 自然书写，即刻呈现。

这是一款 **Typora 式** 的 Markdown 编辑器原型：*源码与渲染同层*，标记默认隐藏，光标回到该行时才露出 \`**\`、\`#\` 这类符号[^1]。

[TOC]

## 现在可以试试

1. 把光标移到上面任意一行，观察标记的出现与消失
2. 输入 \`Ctrl+O\` 打开本地 .md 文件，\`Ctrl+S\` 保存，\`Ctrl+Shift+S\` 另存为
3. 输入 \`Ctrl+Shift+P\` 打印或另存为 PDF，排版与打印预览一致

## 排版能力

- [x] 粗体、斜体、~~删除线~~、行内代码
- [x] ==高亮==、H~2~O、x^2^
- [x] 图片与公式都在编辑器里显示

| 能力 | 编辑器 | 打印 / PDF |
|:--|:--:|--:|
| 标题与强调 | 即时渲染 | 保留字重 |
| 表格 | 原文可编辑 | 跨页重复表头 |
| 代码块 | 等宽底色 | 长行自动折行 |
| SVG | 直接显示图形 | 矢量输出 |

## 代码

\`\`\`ts
export function greet(name: string): string {
  return \`你好，\${name}\`;
}
\`\`\`

## 图形：直接写 SVG
<svg viewBox="0 0 560 120" role="img" aria-label="写作流程">
  <rect x="8" y="28" width="150" height="64" rx="12" fill="#f2efe7" stroke="#ddd7ca"/>
  <text x="83" y="66" text-anchor="middle" font-family="serif" font-size="17" fill="#26221d">写 Markdown</text>
  <path d="M168 60 H222" stroke="#b4472e" stroke-width="2" marker-end="url(#arrow)"/>
  <rect x="232" y="28" width="140" height="64" rx="12" fill="#f2efe7" stroke="#ddd7ca"/>
  <text x="302" y="66" text-anchor="middle" font-family="serif" font-size="17" fill="#26221d">即时渲染</text>
  <path d="M382 60 H436" stroke="#b4472e" stroke-width="2" marker-end="url(#arrow)"/>
  <rect x="446" y="28" width="106" height="64" rx="12" fill="#b4472e"/>
  <text x="499" y="66" text-anchor="middle" font-family="serif" font-size="17" fill="#fffdf8">成稿</text>
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
      <path d="M0 0 L10 5 L0 10 z" fill="#b4472e"/>
    </marker>
  </defs>
</svg>

写标题时它是一段文字，写图形时它是一张图。

## 公式与图表

行内公式 $E = mc^2$，块级公式：

$$
\\int_0^1 x^2 \\, dx = \\frac{1}{3}
$$

图表用 mermaid，编辑器与打印都渲染成矢量图（点进去可以改源码）：

\`\`\`mermaid
graph LR
  A[写] --> B[渲染]
  B --> C[导出]
\`\`\`

<!-- pagebreak -->

## 第二页

这一段在小标题之前加了一行 \`<!-- pagebreak -->\`，打印时从新的一页开始 —— 网页排版里没有分页符，只能靠这种约定补上。

---

还没做的：多标签页、云同步、导出 Word/ePub。
目标是把它做成一个每天都能用的写作工具，而不是又一个 demo。

[^1]: 脚注引用在编辑器里显示为上标，打印/导出时生成文末注释。
`;
