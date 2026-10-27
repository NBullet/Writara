/** 菜单模型：菜单栏与命令面板共用同一份定义。 */

export type MenuItem =
  | { type: "separator" }
  | {
      type: "item";
      id: string;
      label: string;
      shortcut?: string;
      checked?: boolean;
      disabled?: boolean;
    }
  | { type: "submenu"; id: string; label: string; items: MenuItem[] };

export interface Menu {
  id: string;
  label: string;
  items: MenuItem[];
}

/** 把键盘事件归一成 `Mod+Shift+Digit1` 这类字符串。 */
export function comboFromEvent(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Mod");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");

  // 字母用 key，其余用 code：Shift+1 的 key 是 "!"，但 code 始终是 Digit1。
  const key = /^[a-z]$/i.test(event.key) ? event.key.toLowerCase() : event.code;
  parts.push(key);
  return parts.join("+");
}

/** 菜单里显示用（Windows 习惯）。 */
export function displayShortcut(combo: string): string {
  return combo
    .replace(/^Mod/, "Ctrl")
    .replace(/\bDigit(\d)\b/g, "$1")
    .replace(/\bEqual\b/, "=")
    .replace(/\bMinus\b/, "-")
    .replace(/\bBackquote\b/, "`")
    .replace(/\bBracketLeft\b/, "[")
    .replace(/\bBracketRight\b/, "]")
    .replace(/\bBackslash\b/, "\\")
    .replace(/\bComma\b/, ",")
    .replace(/\bPeriod\b/, ".")
    .replace(/\bSlash\b/, "/")
    .replace(/\bSemicolon\b/, ";")
    .replace(/\bQuote\b/, "'")
    .replace(/\+/g, " ");
}
