import type { EditorView } from "@codemirror/view";

import { platform } from "../platform";
import { loadSettings } from "../storage/settings";
import { currentImageTarget } from "./image-target";

/**
 * 插入附件（拖入 / 粘贴 / 菜单选择）。
 *
 * 与图片走同一套保存规则（assets / 当前目录 / 指定路径、相对路径、URL 转义），
 * 只是插成普通链接：`[报告.pdf](报告.assets/报告.pdf)`，编辑器里显示成文件名胶囊，
 * Ctrl/Cmd + 点击用系统默认程序打开。
 */

export function attachmentFiles(files: File[]): File[] {
  return files.filter(
    (file) => !file.type.startsWith("image/") && !/\.(md|markdown|mdx|txt)$/i.test(file.name),
  );
}

async function saveFile(file: File): Promise<{ path: string } | null> {
  const settings = loadSettings();
  const docPath = currentImageTarget() ?? "";
  const save = platform().saveImage;
  if (!save) return null;
  if (!settings.imageApplyLocal) return null;

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await save(
      docPath,
      {
        target: settings.imageAction === "inline" ? "assets" : settings.imageAction,
        path: settings.imagePath,
        // 没有文档目录时只能写绝对路径（主进程会落到应用数据目录）。
        relative: docPath ? settings.imageRelative : false,
      },
      file.name || "附件",
      data,
    );
    return result ? { path: result.path } : null;
  } catch {
    return null;
  }
}

function markdownTarget(url: string, escape: boolean): string {
  if (escape) {
    return encodeURI(url).replace(/[()#?]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  return /\s/.test(url) ? `<${url}>` : url;
}

export async function insertAttachments(view: EditorView, files: File[], pos: number): Promise<void> {
  const settings = loadSettings();
  const lines: string[] = [];

  for (const file of attachmentFiles(files)) {
    const name = file.name || "附件";
    const saved = await saveFile(file);
    if (saved) {
      lines.push(`[${name}](${markdownTarget(saved.path, settings.imageEscape)})`);
    } else {
      // 没有可写的目录（Web 端 / 未保存的文档）：只留文件名，不制造坏链接。
      lines.push(name);
    }
  }

  if (lines.length === 0) return;

  const text = `\n${lines.join("\n")}\n`;
  const at = Math.max(0, Math.min(pos, view.state.doc.length));
  view.dispatch({
    changes: { from: at, insert: text },
    selection: { anchor: at + text.length },
  });
  view.focus();
}
