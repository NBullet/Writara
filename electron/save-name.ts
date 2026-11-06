/** Windows 文件名里不允许出现的字符（控制字符也算）。 */
// eslint-disable-next-line no-control-regex -- Windows 文件名不允许控制字符
const ILLEGAL = /[<>:"/\\|?*\u0000-\u001f]/g;

/**
 * 保存对话框的初始文件名。
 *
 * 只留最后一个路径段并去掉非法字符：名称里混进 `03-Projects/xxx.md` 这类
 * 路径时，原生保存对话框的「文件名」框会直接报「文件名无效」。
 */
export function saveBaseName(name: string, fallback = "未命名"): string {
  const base = String(name ?? "").split(/[\\/]/).pop() ?? "";
  return (
    base
      .replace(ILLEGAL, "_")
      .replace(/\s+/g, " ")
      // Windows 会静默去掉结尾的点和空格；这里先去掉，避免「文件名无效」。
      .replace(/[. ]+$/, "")
      .trim() || fallback
  );
}

/** 导出文件名的公共部分：去掉文档扩展名，再由调用方补目标格式。 */
export function exportBaseName(name: string, fallback = "未命名"): string {
  return (
    saveBaseName(name, fallback)
      .replace(/\.(md|markdown|mdx|txt)$/i, "")
      .trim() || fallback
  );
}
