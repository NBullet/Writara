/**
 * 附件链接的识别与路径解析。
 *
 * 附件用标准 Markdown 链接表示（`[报告.pdf](assets/报告.pdf)`），不引入自定义语法，
 * 这样别的编辑器、导出 HTML、GitHub 预览都能正确显示。
 */

/** 会被当作附件的扩展名（图片与文档除外——Markdown 自己会被编辑器打开）。 */
const ATTACHMENT_EXT =
  /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|zip|rar|7z|tar|gz|tgz|bz2|xz|mp3|wav|flac|m4a|mp4|mov|avi|mkv|webm|epub|mobi|csv|tsv|json|ya?ml|toml|ini|log|psd|ai|sketch|fig|dwg|dxf|ipynb|sql|db|sqlite)$/i;

export function isAttachmentTarget(target: string): boolean {
  const value = target.trim();
  if (!value || value.startsWith("#")) return false;

  // Windows 绝对路径形如 `C:\...`，看起来像 URL scheme，要先排除。
  const windowsAbsolute = /^[a-zA-Z]:[\\/]/.test(value);
  if (!windowsAbsolute && (/^[a-z][a-z0-9+.-]*:/i.test(value) || value.startsWith("//"))) return false;

  const withoutQuery = value.split("#")[0]!.split("?")[0]!;
  return ATTACHMENT_EXT.test(withoutQuery.replace(/[<>]/g, ""));
}

/** 把链接目标解析成绝对路径；绝对路径原样返回。 */
export function absoluteTarget(docPath: string, target: string): string {
  const cleaned = decodeURI(target.replace(/^<|>$/g, "").split("#")[0]!.split("?")[0]!);
  if (/^[a-zA-Z]:[\\/]/.test(cleaned) || cleaned.startsWith("/") || cleaned.startsWith("\\\\")) {
    return cleaned;
  }

  const dir = docPath.slice(0, Math.max(docPath.lastIndexOf("/"), docPath.lastIndexOf("\\")));
  const parts = dir.replace(/\\/g, "/").split("/").filter(Boolean);
  for (const part of cleaned.split(/[\\/]/)) {
    if (!part || part === ".") continue;
    if (part === "..") {
      parts.pop();
      continue;
    }
    parts.push(part);
  }
  return parts.join("/");
}
