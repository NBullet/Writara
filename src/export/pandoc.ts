import { documentTitle } from "../markdown/render";
import { parseFrontMatter } from "../markdown/frontmatter";
import { preparePandocMarkdown } from "./pandoc-markdown";
import type { DocxTemplateId } from "./docx-templates";

/**
 * 经 Pandoc 导出 Word / ePub。
 *
 * 输入是**预处理后的 Markdown 原文**（不是渲染后的 HTML）：Pandoc 的 HTML reader
 * 会丢掉全部 CSS，代码块也只剩纯文本，Word 里既没有字体也没有语法高亮。
 * 现在样式由 `--reference-doc` 的内置模板决定，代码高亮、公式、脚注、分页都交给
 * Pandoc 原生处理；这里只把 Mermaid / SVG / 图片尺寸换成 Pandoc 认识的写法。
 * Pandoc 本身仍由用户安装，路径来自偏好设置。
 */

export type PandocFormat = "docx" | "epub";

export interface PandocOptions {
  pandocPath?: string;
  /** 文档所在目录，Pandoc 用它解析相对路径资源。 */
  resourceDir?: string;
  /** Word 参考模板。 */
  template?: DocxTemplateId;
  /** `template === "custom"` 时的模板绝对路径。 */
  customTemplate?: string;
  /** 生成 Word 目录（域，打开时自动更新）。 */
  toc?: boolean;
  /** 标题自动编号（1 / 1.1）。 */
  numberSections?: boolean;
  /** 页脚页码。 */
  pageNumbers?: boolean;
}


export async function exportWithPandoc(
  source: string,
  fileName: string,
  format: PandocFormat,
  options: PandocOptions = {},
): Promise<string | null> {
  const bridge = window.writara?.pandoc;
  if (!bridge) throw new Error("Word / ePub 导出需要桌面版");

  // Word：只认 Front Matter 里的 title——否则 Title 段会和正文第一个 H1 重复一遍。
  // ePub：没有 YAML 标题时退回文档标题（电子书需要书名）。
  const title = parseFrontMatter(source)?.title || (format === "epub" ? documentTitle(source, fileName) : "");
  const prepared = await preparePandocMarkdown(source);

  const result = await bridge.export({
    markdown: prepared.markdown,
    suggestedName: fileName,
    format,
    pandocPath: options.pandocPath,
    resourceDir: options.resourceDir,
    title,
    template: options.template,
    customTemplate: options.customTemplate,
    toc: options.toc || prepared.toc,
    numberSections: options.numberSections,
    pageNumbers: options.pageNumbers,
  });
  return result?.path ?? null;
}
