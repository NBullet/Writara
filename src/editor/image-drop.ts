import type { Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

import { platform } from "../platform";
import { loadSettings } from "../storage/settings";
import { attachmentFiles, insertAttachments } from "./attachment";
import { currentImageTarget } from "./image-target";

/**
 * 拖入 / 粘贴图片。
 *
 * 桌面端：写到文档旁边的 `${文档名}.assets/`，文档里插入相对路径。
 * 浏览器 / 未保存的文档：退回 data URL（没有可写的目录）。
 */

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function imageFiles(files: FileList | null | undefined): File[] {
  return Array.from(files ?? []).filter((file) => file.type.startsWith("image/"));
}

/** 优先落盘；失败、没有目标目录或设置为内联时返回 null，由调用方退回 data URL。 */
async function saveToAssets(file: File): Promise<string | null> {
  const settings = loadSettings();
  const target = currentImageTarget();
  const save = platform().saveImage;

  if (!target || !save) return null;
  if (settings.imageAction === "inline" || !settings.imageApplyLocal) return null;

  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const result = await save(
      target,
      {
        target: settings.imageAction,
        path: settings.imagePath,
        relative: settings.imageRelative,
      },
      file.name || "image.png",
      data,
    );
    return result?.path ?? null;
  } catch {
    return null;
  }
}

/** 按设置转义 URL：整体编码，或仅在含空格时用尖括号包住。 */
function markdownTarget(url: string, escape: boolean): string {
  if (url.startsWith("data:")) return url;
  if (escape) {
    // encodeURI 不处理这些会截断 Markdown 链接的字符。
    return encodeURI(url).replace(/[()#?]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
  }
  return /\s/.test(url) ? `<${url}>` : url;
}

export async function insertImages(view: EditorView, files: File[], pos: number): Promise<void> {
  const lines: string[] = [];
  const settings = loadSettings();

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    try {
      const name = file.name.replace(/\.[^.]+$/, "").trim() || "图片";
      const saved = await saveToAssets(file);
      const url = saved ?? (await readAsDataUrl(file));
      if (!url) continue;
      lines.push(`![${name}](${markdownTarget(url, settings.imageEscape)})`);
    } catch {
      // 单张失败不影响其余图片
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

export function imageDrop(): Extension {
  return EditorView.domEventHandlers({
    drop(event, view) {
      const all = Array.from(event.dataTransfer?.files ?? []);
      const images = imageFiles(event.dataTransfer?.files);
      const pos =
        view.posAtCoords({ x: event.clientX, y: event.clientY }) ?? view.state.selection.main.head;

      if (images.length > 0) {
        event.preventDefault();
        void insertImages(view, images, pos);
        return true;
      }

      const others = attachmentFiles(all);
      if (others.length === 0) return false;
      event.preventDefault();
      void insertAttachments(view, others, pos);
      return true;
    },
    paste(event, view) {
      const all = Array.from(event.clipboardData?.files ?? []);
      const images = imageFiles(event.clipboardData?.files);
      const pos = view.state.selection.main.head;

      if (images.length > 0) {
        event.preventDefault();
        void insertImages(view, images, pos);
        return true;
      }

      const others = attachmentFiles(all);
      if (others.length === 0) return false;
      event.preventDefault();
      void insertAttachments(view, others, pos);
      return true;
    },
  });
}
