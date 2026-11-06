/**
 * 单元格浮层里的行内格式。
 *
 * 表格常驻渲染态，单元格编辑走叠在格子上的 `<input>`。这个输入框不是编辑器，
 * 全局快捷键会按「输入框里不抢键」的规则跳过（`App` 的 window 捕获监听），
 * 所以格式键必须在输入框里就地处理。
 *
 * 语义与 `editor/commands.ts` 的 `toggleWrap` 一致：选区自带标记就去掉，
 * 两侧正好是标记就一起去掉，空选区插入一对标记，其余包裹。区别只是作用对象
 * 是 `input.value`，改完仍停在输入框里，提交时再写回表格源码。
 */

export interface CellSelection {
  value: string;
  start: number;
  end: number;
}

export interface CellFormat {
  open: string;
  close: string;
}

/** 格式命令 id → 标记；`code` 按选区里有没有反引号决定标记长度。 */
export function cellFormatMarkers(id: string, selected: string): CellFormat | null {
  switch (id) {
    case "bold":
      return { open: "**", close: "**" };
    case "italic":
      return { open: "*", close: "*" };
    case "strike":
      return { open: "~~", close: "~~" };
    case "underline":
      return { open: "<u>", close: "</u>" };
    case "highlight":
      return { open: "==", close: "==" };
    case "code": {
      const marker = selected.includes("`") ? "``" : "`";
      return { open: marker, close: marker };
    }
    default:
      return null;
  }
}

export function toggleCellWrap(selection: CellSelection, format: CellFormat): CellSelection {
  const { open, close } = format;
  const value = selection.value;
  const start = Math.max(0, Math.min(selection.start, value.length));
  const end = Math.max(start, Math.min(selection.end, value.length));
  const picked = value.slice(start, end);

  // 1. 选区本身就带着标记：去掉
  if (
    picked.length >= open.length + close.length &&
    picked.startsWith(open) &&
    picked.endsWith(close)
  ) {
    const inner = picked.slice(open.length, picked.length - close.length);
    return {
      value: value.slice(0, start) + inner + value.slice(end),
      start,
      end: start + inner.length,
    };
  }

  // 2. 选区两侧正好是标记：一起去掉
  if (
    value.slice(start - open.length, start) === open &&
    value.slice(end, end + close.length) === close
  ) {
    return {
      value: value.slice(0, start - open.length) + picked + value.slice(end + close.length),
      start: start - open.length,
      end: end - open.length,
    };
  }

  // 3. 空选区：插入一对标记，光标停在中间
  if (start === end) {
    return {
      value: value.slice(0, start) + open + close + value.slice(start),
      start: start + open.length,
      end: start + open.length,
    };
  }

  // 4. 普通包裹
  return {
    value: value.slice(0, start) + open + picked + close + value.slice(end),
    start: start + open.length,
    end: start + open.length + picked.length,
  };
}
