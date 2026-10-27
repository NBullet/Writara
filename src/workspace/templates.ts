import type { WorkspaceFile } from "../platform/types";
import { TEMPLATE_DIR } from "./config";

/**
 * 文档模板。
 *
 * 刻意克制：模板就是一份普通 .md 的内容——**没有任何占位符与变量替换**
 * （front matter 已有 title/date，缺的不是变量）。内置模板打进包里当起点，
 * 工作区里放一个 `.writara/templates/` 目录就能扩展，复制出去即用。
 */

export interface DocTemplate {
  id: string;
  name: string;
  /** 内置模板直接带正文。 */
  content: string;
  /** 工作区模板记下文件身份，交给 workspace.read() 读正文。 */
  file?: WorkspaceFile;
}

export const SYNTAX_COOKBOOK = `---
title: Writara 语法示例集
---

照这份示例改写即可；每一节都是可以直接删掉的活例子。

## 基础

**加粗**、*斜体*、~~删除线~~、\`行内代码\`、==高亮==、下标 H~2~O、上标 x^2^。

行内公式：质能方程 $E = mc^2$。

## 列表与任务

1. 有序列表
2. 可以嵌套：
   - 无序子项
   - 子项二

- [ ] 任务列表（未完成）
- [x] 已完成的任务

## 表格

列宽由分隔行的横线数量编码（横线越多越宽）：

| 学科 | 说明 |
| --- | ------- |
| 数学 | 公式编号见下 |
| 语文 | 无数 |

## 公式与编号

块级公式按文档顺序自动编号（设置里开启）：

$$a^2 + b^2 = c^2$$

给公式起名与引用：

$$E = mc^2 \\label{mass-energy}$$

如式 $\\eqref{mass-energy}$，编号 $\\ref{mass-energy}$。

## 围栏代码

\`\`\`ts
const answer = 42;
\`\`\`

## 图表（Mermaid）

\`\`\`mermaid
flowchart LR
  写作 --> 即刻呈现 --> 导出
\`\`\`

## 内容目录

[TOC]

## 其他

> 引用块。也许嵌套。
>
> > 二层。

水平线：

---

链接 [官网](https://example.com)、脚注[^1]、术语定义：

术语
: 下一行起是解释。

[^1]: 脚注在文末生成注释。
`;

export const PROPOSAL_SKELETON = `---
title: （方案名）
---

# 现状

<!-- 背景、问题、现状数据。三段以内，每段一个事实。 -->

# 目标

<!-- 用可验收的表述：做成什么样算完成。尽量列表化。 -->

# 方案

<!-- 总体思路 → 拆分模块/阶段 → 关键取舍（为什么选它）。 -->

\`\`\`mermaid
flowchart LR
  A[输入] --> B[处理] --> C[交付]
\`\`\`

# 步骤与周期

| 阶段 | 内容 | 产出 | 时间 |
| --- | --- | --- | --- |
| 准备 |  |  |  |
| 实施 |  |  |  |
| 收尾 |  |  |  |

# 风险

<!-- 列 3～5 条，每条给对策。占位越多越要删。 -->

# 成本

<!-- 人力 / 资源 / 资金。没有就删这一节，不要保留空段落。 -->
`;

export const BUILTIN_TEMPLATES: Array<{ id: string; name: string; content: string }> = [
  { id: "builtin-syntax", name: "语法示例集", content: SYNTAX_COOKBOOK },
  { id: "builtin-proposal", name: "技术方案（骨架）", content: PROPOSAL_SKELETON },
];

export const TEMPLATE_DIR_PREFIX = TEMPLATE_DIR;

/** 工作区模板按目录名排行；找不到目录时只有内置两份。 */
export function workspaceTemplates(files: WorkspaceFile[]): DocTemplate[] {
  const found = files.filter((file) => file.path.startsWith(TEMPLATE_DIR) && file.path.endsWith(".md"));
  return found.map((file): DocTemplate => {
    const name = file.name.replace(/\.md$/, "") || "未命名模板";
    const depth = file.path.slice(TEMPLATE_DIR.length).split("/").length;
    return {
      id: `tpl-${file.path}`,
      name: depth > 1 ? `${name}（${file.path.slice(TEMPLATE_DIR.length).split("/").slice(0, -1).join("/")}）` : name,
      content: "",
      file,
    };
  });
}
