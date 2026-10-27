import type { AssetKind } from "../platform/types";

/**
 * 项目资源（非 Markdown 文件）的分类。
 *
 * 图片与附件由扫描自动索引，不写进清单；文件树按类型给不同图标，
 * 搜索、命令面板与 AI 文档列表仍然只收 Markdown。
 */

const IMAGE_EXT = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "avif",
  "bmp",
  "ico",
  "svg",
  "tif",
  "tiff",
]);

const ATTACHMENT_EXT = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "csv",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "epub",
  "mp3",
  "wav",
  "m4a",
  "mp4",
  "mov",
  "webm",
]);

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
}

export function assetKindOf(name: string): AssetKind {
  const ext = extensionOf(name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (ATTACHMENT_EXT.has(ext)) return "attachment";
  return "other";
}
