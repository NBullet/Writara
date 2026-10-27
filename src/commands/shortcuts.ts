/** 快捷键表：与菜单里的显示文案保持一致，避免两处漂移。 */
export const SHORTCUTS: Record<string, string> = {
  "Mod+Digit1": "heading-1",
  "Mod+Digit2": "heading-2",
  "Mod+Digit3": "heading-3",
  "Mod+Digit4": "heading-4",
  "Mod+Digit5": "heading-5",
  "Mod+Digit6": "heading-6",
  "Mod+Digit0": "heading-0",
  "Mod+Equal": "heading-promote",
  "Mod+Minus": "heading-demote",

  "Mod+b": "bold",
  "Mod+i": "italic",
  "Mod+u": "underline",
  "Mod+Shift+Backquote": "code",
  "Alt+Shift+Digit5": "strike",
  "Mod+k": "link",
  "Mod+Backslash": "clear-format",

  "Mod+Shift+k": "code-block",
  "Mod+Shift+m": "math-block",
  "Mod+Shift+q": "quote",
  "Mod+Shift+BracketLeft": "list-ordered",
  "Mod+Shift+BracketRight": "list-bullet",

  "Mod+Shift+c": "copy-markdown",
  "Mod+Shift+v": "paste-plain",
  "Mod+d": "select-next-occurrence",
  "Mod+Shift+d": "select-all-occurrences",
  "Mod+Shift+f": "search",
  "Mod+f": "find",
  "Mod+h": "replace",

  "Mod+Shift+l": "toggle-sidebar",
  "Mod+Shift+Digit1": "sidebar-outline",
  "Mod+Shift+Digit3": "sidebar-tree",
  "Mod+Slash": "source-mode",
  F8: "focus-mode",
  F9: "typewriter-mode",
  F11: "fullscreen",
  "Mod+Shift+Digit9": "zoom-reset",
  "Mod+Shift+Equal": "zoom-in",
  "Mod+Shift+Minus": "zoom-out",

  "Mod+n": "new",
  "Mod+Shift+n": "new-window",
  "Mod+o": "open",
  "Mod+s": "save",
  "Mod+Shift+s": "save-as",
  "Mod+p": "palette",
  "Mod+Shift+p": "print",
  "Mod+Comma": "settings",
};

/** 只在编辑器里生效、交给 CodeMirror 自己处理的组合。 */
export const EDITOR_NATIVE = new Set(["Mod+z", "Mod+Shift+z", "Mod+y"]);
