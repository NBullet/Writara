import { syntaxTree } from "@codemirror/language";
import type { Extension } from "@codemirror/state";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import { slugify } from "../markdown/slug";
import { absoluteTarget, isAttachmentTarget } from "../markdown/attachment";
import { currentImageTarget } from "./image-target";

/**
 * Ctrl/Cmd + 点击打开链接。
 * 与 Typora 一致：普通点击只是放光标，带修饰键才跳转。
 */

function linkAt(state: EditorView["state"], pos: number): string | null {
  const tree = syntaxTree(state);
  let node: SyntaxNode | null = tree.resolveInner(pos, 1);

  while (node) {
    if (node.name === "Link") {
      const url = node.getChild("URL");
      if (url) return state.sliceDoc(url.from, url.to);
    }
    if (node.name === "Autolink") {
      const text = state.sliceDoc(node.from, node.to);
      return text.replace(/^<|>$/g, "");
    }
    if (node.name === "URL") return state.sliceDoc(node.from, node.to);
    node = node.parent;
  }
  return null;
}

function headingPosition(state: EditorView["state"], slug: string): number | null {
  let found: number | null = null;
  syntaxTree(state).iterate({
    enter: (node) => {
      if (found !== null) return false;
      if (!/^(?:ATX|Setext)Heading[1-6]$/.test(node.name)) return undefined;
      const text = state
        .sliceDoc(node.from, node.to)
        .replace(/^[ \t]*#{1,6}[ \t]*/m, "")
        .replace(/[ \t]+#+[ \t]*$/, "")
        .replace(/^[ \t]*(?:=+|-+)[ \t]*$/m, "")
        .replace(/[*_`~]/g, "")
        .trim();
      if (slugify(text) === slug) {
        found = node.from;
        return false;
      }
      return undefined;
    },
  });
  return found;
}

export function linkClick(): Extension {
  return EditorView.domEventHandlers({
    mousedown(event, view) {
      if (!event.metaKey && !event.ctrlKey) return false;

      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (pos == null) return false;
      const href = linkAt(view.state, pos);
      if (!href) return false;

      event.preventDefault();

      if (href.startsWith("#")) {
        let slug = href.slice(1);
        try {
          slug = decodeURIComponent(slug);
        } catch {
          // 保持原样
        }
        const target = headingPosition(view.state, slug);
        if (target !== null) {
          view.dispatch({
            selection: EditorSelection.cursor(target),
            effects: EditorView.scrollIntoView(target, { y: "start" }),
          });
        }
        return true;
      }

      if (/^(https?:|mailto:)/i.test(href)) {
        window.open(href, "_blank", "noopener,noreferrer");
        return true;
      }

      // 本地附件：交给系统默认程序打开（需要文档有磁盘路径）。
      if (isAttachmentTarget(href)) {
        const docPath = currentImageTarget() ?? "";
        if (window.writara?.shell) {
          void window.writara.shell.openPath(absoluteTarget(docPath, href));
        }
        return true;
      }

      return true;
    },
  });
}
