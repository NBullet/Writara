/** 标题锚点：与导出 HTML 的 id、编辑器里的内链跳转共用同一套规则。 */
export function slugify(text: string): string {
  const slug = text
    .trim()
    .toLowerCase()
    // 去掉常见的行内标记字符
    .replace(/[`*_~[\]()#!]/g, "")
    // 只保留字母、数字、空格、连字符（含中文）
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "section";
}

/** 同名标题依次加 -1、-2，保证 id 唯一。 */
export function uniqueSlug(base: string, used: Set<string>): string {
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let index = 1;
  while (used.has(`${base}-${index}`)) index += 1;
  const slug = `${base}-${index}`;
  used.add(slug);
  return slug;
}
