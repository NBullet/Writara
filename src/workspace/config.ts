/**
 * 项目配置目录。
 *
 * `.writara/` 是应用自己的目录：模板、提案、任务单都在这里。它**不进文件树**
 * （扫描时单独分出 `configFiles`），但必须能被读取 —— 扫描默认跳过 `.` 开头的
 * 目录，所以平台层的 scan 要显式包含它。
 */

export const CONFIG_DIR = ".writara";
export const CONFIG_PREFIX = `${CONFIG_DIR}/`;
export const TEMPLATE_DIR = `${CONFIG_DIR}/templates/`;
export const PROPOSAL_DIR = `${CONFIG_DIR}/proposals/`;
/** 项目清单。存在它就是显式项目；不存在就是隐式项目（普通文件夹）。 */
export const PROJECT_MANIFEST_PATH = `${CONFIG_DIR}/project.json`;

export function isConfigPath(path: string): boolean {
  return path.startsWith(CONFIG_PREFIX);
}
