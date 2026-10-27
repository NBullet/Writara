import type { EditorView } from "@codemirror/view";
import { selectNextOccurrence, selectSelectionMatches } from "@codemirror/search";

import * as cmd from "../editor/commands";

/** 纯编辑命令：菜单、快捷键、命令面板共用。 */
export const EDITOR_COMMANDS: Record<string, (view: EditorView) => unknown> = {
  "heading-0": (view) => cmd.setHeading(view, 0),
  "heading-1": (view) => cmd.setHeading(view, 1),
  "heading-2": (view) => cmd.setHeading(view, 2),
  "heading-3": (view) => cmd.setHeading(view, 3),
  "heading-4": (view) => cmd.setHeading(view, 4),
  "heading-5": (view) => cmd.setHeading(view, 5),
  "heading-6": (view) => cmd.setHeading(view, 6),
  "heading-promote": (view) => cmd.promoteHeading(view),
  "heading-demote": (view) => cmd.demoteHeading(view),

  bold: (view) => cmd.toggleBold(view),
  italic: (view) => cmd.toggleItalic(view),
  underline: (view) => cmd.toggleUnderline(view),
  code: (view) => cmd.toggleCode(view),
  strike: (view) => cmd.toggleStrike(view),
  highlight: (view) => cmd.toggleHighlight(view),
  comment: (view) => cmd.toggleComment(view),
  "clear-format": (view) => cmd.clearFormatting(view),

  quote: (view) => cmd.toggleBlockquote(view),
  "list-bullet": (view) => cmd.toggleList(view, "bullet"),
  "list-ordered": (view) => cmd.toggleList(view, "ordered"),
  "list-task": (view) => cmd.toggleList(view, "task"),
  "indent-in": (view) => cmd.indentList(view, 1),
  "indent-out": (view) => cmd.indentList(view, -1),
  "task-done": (view) => cmd.setTaskState(view, true),
  "task-todo": (view) => cmd.setTaskState(view, false),

  "para-above": (view) => cmd.insertParagraph(view, "above"),
  "para-below": (view) => cmd.insertParagraph(view, "below"),
  hr: (view) => cmd.insertHorizontalRule(view),
  toc: (view) => cmd.insertToc(view),
  "link-ref": (view) => cmd.insertLinkReference(view),
  footnote: (view) => cmd.insertFootnote(view),
  link: (view) => cmd.insertLink(view),

  "code-block": (view) => cmd.insertCodeBlock(view),
  "math-inline": (view) => cmd.insertInlineMath(view),
  "math-block": (view) => cmd.insertMathBlock(view),

  "table-row-above": (view) => cmd.tableAddRow(view, "above"),
  "table-row-below": (view) => cmd.tableAddRow(view, "below"),
  "table-row-delete": (view) => cmd.tableDeleteRow(view),
  "table-col-left": (view) => cmd.tableAddColumn(view, "left"),
  "table-col-right": (view) => cmd.tableAddColumn(view, "right"),
  "table-col-delete": (view) => cmd.tableDeleteColumn(view),
  "table-align-left": (view) => cmd.tableAlign(view, "left"),
  "table-align-center": (view) => cmd.tableAlign(view, "center"),
  "table-align-right": (view) => cmd.tableAlign(view, "right"),

  undo: (view) => cmd.undoCommand(view),
  redo: (view) => cmd.redoCommand(view),
  "select-line": (view) => cmd.selectLine(view),
  "select-block": (view) => cmd.selectBlock(view),
  "delete-line": (view) => cmd.deleteLine(view),
  "delete-block": (view) => cmd.deleteBlock(view),
  "delete-selection": (view) => cmd.deleteSelection(view),
  "select-next-occurrence": (view) => selectNextOccurrence(view),
  "select-all-occurrences": (view) => selectSelectionMatches(view),
};
