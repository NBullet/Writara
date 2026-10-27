// @vitest-environment jsdom
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it } from "vitest";

import { writaraExtensions } from "./extensions";
import { insertImages } from "./image-drop";

let view: EditorView | null = null;

afterEach(() => {
  view?.destroy();
  view = null;
});

function mount(doc: string): EditorView {
  const parent = document.createElement("div");
  document.body.appendChild(parent);
  view = new EditorView({
    parent,
    state: EditorState.create({ doc, extensions: writaraExtensions() }),
  });
  return view;
}

describe("insertImages", () => {
  it("把图片读成 data URL 插进文档", async () => {
    const editor = mount("前文");
    const file = new File([new Uint8Array([137, 80, 78, 71])], "截图.png", { type: "image/png" });

    await insertImages(editor, [file], editor.state.doc.length);

    const text = editor.state.doc.toString();
    expect(text).toContain("![截图](data:image/png;base64,");
    expect(text.indexOf("![截图]")).toBeGreaterThan(text.indexOf("前文"));
  });

  it("非图片文件被忽略", async () => {
    const editor = mount("前文");
    const file = new File(["hello"], "note.txt", { type: "text/plain" });
    await insertImages(editor, [file], editor.state.doc.length);
    expect(editor.state.doc.toString()).toBe("前文");
  });
});
