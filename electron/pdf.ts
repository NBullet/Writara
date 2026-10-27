import { app, BrowserWindow, dialog } from "electron";
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { pathToFileURL } from "node:url";

import type { PDFDocument } from "pdf-lib";

/**
 * pdf-lib 只在补 PDF 元数据时用到，但它是主进程里最大的一块依赖。
 * 顶层 import 会让它在每次启动时被解析、求值，直接拖慢「双击 → 出现窗口」；
 * 这里按需加载，导出第一次 PDF 时才付这笔钱。
 */
interface PdfLib {
  PDFDocument: { load: (bytes: Uint8Array) => Promise<PDFDocument> };
}
let pdfLib: Promise<PdfLib> | null = null;
function loadPdfLib(): Promise<PdfLib> {
  pdfLib ??= import("pdf-lib");
  return pdfLib;
}

/**
 * PDF 导出。
 *
 * 走 Chromium 自己的打印后端（`webContents.printToPDF`），而不是 `window.print()`：
 * 后者会弹系统对话框，且无法控制页边距、页码、书签。
 *
 * 关键参数：
 * - `preferCSSPageSize`：纸张与页边距完全交给 `@page`（`src/export/page.ts` 生成），
 *   这里**不传** `margins`，避免出现第二份几何来源。
 * - `printBackground`：否则主题底色、代码块底色全丢。
 * - `generateDocumentOutline`：用标题生成 PDF 书签。
 */

export interface PdfExportRequest {
  /** 完整单文件 HTML（样式与 KaTeX 字体已内联）。 */
  html: string;
  suggestedName: string;
  pageNumbers?: boolean;
  pageRanges?: string;
  /** PDF 元数据；Chromium 只写标题，作者/主题靠 pdf-lib 补。 */
  metadata?: { title?: string; author?: string; subject?: string };
}

const FOOTER_TEMPLATE = `
<div style="width:100%; padding:0 18mm; font-family:-apple-system,'Segoe UI','Microsoft YaHei',sans-serif; font-size:9px; color:#8a8a8a; display:flex; justify-content:center;">
  <span class="pageNumber"></span><span style="margin:0 2px">/</span><span class="totalPages"></span>
</div>`;

function pdfName(name: string): string {
  const base = name.replace(/\.(md|markdown|mdx|txt)$/i, "").trim() || "未命名";
  return `${base}.pdf`;
}

/** 等字体与图片就绪：否则首份 PDF 会用回退字体、图表也可能还没画完。 */
const WAIT_READY = `
  Promise.race([document.fonts.ready, new Promise((resolve) => setTimeout(resolve, 3000))])
    .then(() => Promise.all(Array.from(document.images).map((image) => image.decode().catch(() => undefined))))
    .then(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
`;

/**
 * Chromium 只把 `<title>` 写进 PDF 元数据；作者、主题、生成器靠 pdf-lib 补。
 * 解析失败（极少见）就原样返回，不因为元数据把导出搞失败。
 */
async function withMetadata(
  bytes: Uint8Array,
  metadata?: { title?: string; author?: string; subject?: string },
): Promise<Uint8Array> {
  if (!metadata || (!metadata.title && !metadata.author && !metadata.subject)) return bytes;
  try {
    const { PDFDocument } = await loadPdfLib();
    const doc = await PDFDocument.load(bytes);
    if (metadata.title) doc.setTitle(metadata.title);
    if (metadata.author) doc.setAuthor(metadata.author);
    if (metadata.subject) doc.setSubject(metadata.subject);
    doc.setCreator("Writara");
    doc.setProducer("Writara");
    return await doc.save();
  } catch {
    return bytes;
  }
}

/** 渲染 PDF 字节：隐藏窗口加载 HTML → 等字体/图片 → printToPDF → 补元数据。 */
async function renderPdf(request: PdfExportRequest): Promise<Uint8Array> {
  const tempHtml = path.join(app.getPath("temp"), `writara-export-${randomUUID()}.html`);
  await fs.writeFile(tempHtml, request.html, "utf8");

  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  try {
    await win.loadFile(tempHtml);
    await win.webContents.executeJavaScript(WAIT_READY);

    const pdf = await win.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter: Boolean(request.pageNumbers),
      headerTemplate: "<span></span>",
      footerTemplate: request.pageNumbers ? FOOTER_TEMPLATE : "<span></span>",
      pageRanges: request.pageRanges ?? "",
      generateDocumentOutline: true,
    });

    return await withMetadata(pdf, request.metadata);
  } finally {
    win.destroy();
    await fs.unlink(tempHtml).catch(() => undefined);
  }
}

export async function exportPdf(request: PdfExportRequest): Promise<{ path: string } | null> {
  const result = await dialog.showSaveDialog({
    defaultPath: pdfName(request.suggestedName),
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (result.canceled || !result.filePath) return null;

  const target = result.filePath;
  await fs.writeFile(target, await renderPdf(request));
  return { path: target };
}

let previewWindow: BrowserWindow | null = null;

/**
 * 打印预览。
 *
 * Electron 不带 Chromium 的打印预览 UI，`window.print()` 只会弹系统对话框（没有预览）。
 * 所以桌面端先渲染成 PDF，再用内置阅读器打开：能看真实分页，也能在阅读器里直接打印。
 */
export async function previewPdf(request: PdfExportRequest): Promise<{ path: string }> {
  const tempPdf = path.join(app.getPath("temp"), `writara-preview-${randomUUID()}.pdf`);
  await fs.writeFile(tempPdf, await renderPdf(request));

  previewWindow?.destroy();
  const win = new BrowserWindow({
    // 100% 缩放下 A4 是 793px 宽，再加阅读器自己的书签栏；
    // 窗口窄了就会出现横向滚动条，看着比编辑器小一圈。
    width: 1240,
    height: 1180,
    minWidth: 520,
    minHeight: 480,
    title: `打印预览 — ${request.suggestedName}`,
    autoHideMenuBar: true,
    backgroundColor: "#2b2b2b",
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false },
  });
  previewWindow = win;

  win.on("closed", () => {
    void fs.unlink(tempPdf).catch(() => undefined);
    if (previewWindow === win) previewWindow = null;
  });

  // 用 100% 打开：预览窗口的「适应页面」会把 A4 缩到 ~88%，看着比编辑器小一圈，
  // 让人误以为字号不一致。100% 下屏幕与纸面是同一个字号。
  await win.loadURL(`${pathToFileURL(tempPdf).toString()}#zoom=100`);
  return { path: tempPdf };
}
