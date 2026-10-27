import { documentTitle } from "../markdown/render";
import { exportableHtml, printMarkdown } from "./print";

/**
 * 导出 PDF。
 *
 * 桌面端：渲染成自包含 HTML → 主进程用 `printToPDF` 生成 → 原生保存对话框。
 * 浏览器：没有这条通道，退回系统打印对话框（用户自己选「另存为 PDF」）。
 */

export interface PdfOptions {
  pageNumbers?: boolean;
  pageRanges?: string;
  /** 导出主题：`current` 或某个主题风格。 */
  style?: string;
  /** 写入 PDF 元数据的作者。 */
  author?: string;
}

/**
 * 打印预览：桌面端渲染成 PDF 交给内置阅读器（Electron 没有 Chromium 的打印预览 UI），
 * Web 端直接用浏览器打印对话框（那边本来就有预览）。
 */
export async function previewPdf(
  source: string,
  fileName: string,
  options: PdfOptions = {},
): Promise<string | null> {
  const bridge = window.writara?.pdf;
  if (!bridge) {
    await printMarkdown(source);
    return null;
  }

  const title = documentTitle(source, fileName);
  const html = await exportableHtml(source, title, options.style ?? "current");
  const result = await bridge.preview({
    html,
    suggestedName: fileName,
    pageNumbers: options.pageNumbers ?? true,
    pageRanges: options.pageRanges,
    metadata: { title, author: options.author || undefined },
  });
  return result?.path ?? null;
}

export async function exportPdf(
  source: string,
  fileName: string,
  options: PdfOptions = {},
): Promise<string | null> {
  const bridge = window.writara?.pdf;
  if (!bridge) {
    await printMarkdown(source);
    return null;
  }

  const title = documentTitle(source, fileName);
  const html = await exportableHtml(source, title, options.style ?? "current");
  const result = await bridge.export({
    html,
    suggestedName: fileName,
    pageNumbers: options.pageNumbers ?? true,
    pageRanges: options.pageRanges,
    metadata: { title, author: options.author || undefined },
  });
  return result?.path ?? null;
}

/**
 * 已经生成好的自包含 HTML → PDF（项目合并导出用）。
 *
 * 与单文档导出共用主进程通道；没有桌面桥时返回 null，由调用方退回下载 HTML。
 */
export async function exportHtmlAsPdf(
  html: string,
  fileName: string,
  options: PdfOptions & { title?: string } = {},
): Promise<string | null> {
  const bridge = window.writara?.pdf;
  if (!bridge) return null;

  const title = options.title ?? fileName.replace(/\.pdf$/i, "");
  const result = await bridge.export({
    html,
    suggestedName: fileName,
    pageNumbers: options.pageNumbers ?? true,
    pageRanges: options.pageRanges,
    metadata: { title, author: options.author || undefined },
  });
  return result?.path ?? null;
}
