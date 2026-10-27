/**
 * Word 导出的参考模板清单。
 *
 * 模板文件由 `scripts/make-docx-templates.mjs` 生成到 `resources/templates/`，
 * 打包时经 electron-builder 的 extraResources 复制到 `resourcesPath/templates`。
 * 这里只放 id 与显示名：渲染进程不认识文件路径，解析在 `electron/pandoc.ts`。
 */

export type DocxTemplateId = "writara-cn" | "gongwen" | "tech" | "custom";

export const DOCX_TEMPLATES: Array<{ id: DocxTemplateId; label: string }> = [
  { id: "writara-cn", label: "中文文稿" },
  { id: "gongwen", label: "公文" },
  { id: "tech", label: "技术文档" },
  { id: "custom", label: "自定义模板" },
];

export const DEFAULT_DOCX_TEMPLATE: DocxTemplateId = "writara-cn";

/** 落盘值可能是旧版本留下的任意字符串，这里统一收口。 */
export function normalizeDocxTemplate(value: unknown): DocxTemplateId {
  const match = DOCX_TEMPLATES.find((template) => template.id === value);
  return match ? match.id : DEFAULT_DOCX_TEMPLATE;
}
