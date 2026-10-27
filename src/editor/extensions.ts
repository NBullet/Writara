import { autocompletion } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { CaretSyntax, HighlightSyntax, MathSyntax } from "../markdown/parser";
import { search, searchKeymap } from "@codemirror/search";
import { EditorState, type Extension } from "@codemirror/state";
import {
  EditorView,
  drawSelection,
  dropCursor,
  highlightSpecialChars,
  keymap,
  placeholder,
} from "@codemirror/view";
import { tags } from "@lezer/highlight";

import { editorOptions, modeExtension, previewExtension } from "./modes";
import { aiSelectionToolbar } from "./ai-toolbar";
import { imageDrop } from "./image-drop";
import { fenceLanguageSource } from "./language-completion";
import { smoothScrollbar } from "./scrollbar";
import { writaraTheme } from "./theme";
import { findHighlightField } from "./find-highlight";
import { slopMarksField } from "./slop-marks";

/** 代码块与行内代码的着色（正文本身由 livePreview 负责）。 */
const codeHighlight = HighlightStyle.define([
  { tag: tags.monospace, fontFamily: "var(--wr-font-mono)" },
  { tag: tags.keyword, color: "var(--wr-accent)" },
  { tag: [tags.string, tags.special(tags.string), tags.inserted], color: "var(--wr-link)" },
  { tag: [tags.comment, tags.lineComment, tags.blockComment], color: "var(--wr-muted)", fontStyle: "italic" },
  { tag: [tags.number, tags.bool, tags.atom, tags.null], color: "var(--wr-accent)" },
  { tag: [tags.typeName, tags.className, tags.namespace], color: "var(--wr-accent)" },
  { tag: [tags.function(tags.variableName), tags.labelName], color: "var(--wr-link)" },
  { tag: [tags.operator, tags.operatorKeyword, tags.url, tags.escape, tags.regexp, tags.link], color: "var(--wr-link)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--wr-link)" },
  { tag: [tags.definition(tags.name), tags.variableName], color: "var(--wr-text)" },
  { tag: [tags.meta, tags.annotation, tags.processingInstruction], color: "var(--wr-muted)" },
  { tag: tags.heading, fontWeight: "700" },
  { tag: tags.strong, fontWeight: "700" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strikethrough, textDecoration: "line-through" },
  { tag: tags.invalid, color: "var(--wr-accent)", textDecoration: "underline wavy" },
]);

export function writaraExtensions(onChange?: (doc: string) => void): Extension[] {
  return [
    highlightSpecialChars(),
    history(),
    drawSelection(),
    dropCursor(),
    EditorState.allowMultipleSelections.of(true),
    EditorView.lineWrapping,
    // markdown() 默认 base 是 commonmarkLanguage，不含 GFM（删除线、表格、任务列表）。
    markdown({
      base: markdownLanguage,
      extensions: [CaretSyntax, HighlightSyntax, MathSyntax],
      codeLanguages: languages,
    }),
    previewExtension(false),
    modeExtension({ focus: false, typewriter: false }),
    editorOptions({ spellcheck: true, smartPunctuation: false, codeLineNumbers: false, codeIndent: 2 }),
    imageDrop(),
    autocompletion({ override: [fenceLanguageSource] }),
    writaraTheme,
    smoothScrollbar(),
    syntaxHighlighting(codeHighlight),
    placeholder("开始写点什么……"),
    search({ top: true }),
    findHighlightField,
    // 反 AI 腔标记（规则层「先标记、再应用」）
    slopMarksField,
    // 选区浮条不分模式：源码模式下也要能对选中文字出 AI 动作
    aiSelectionToolbar(),
    keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
    EditorView.updateListener.of((update) => {
      if (update.docChanged) onChange?.(update.state.doc.toString());
    }),
  ];
}
