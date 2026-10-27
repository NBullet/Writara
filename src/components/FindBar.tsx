import { useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from "react";

/** 自写的查找栏：CodeMirror 面板不支持「仅在选区内」，这里统一做。 */

export interface FindBarProps {
  open: boolean;
  focusTarget: "query" | "replace";
  query: string;
  replacement: string;
  caseSensitive: boolean;
  regex: boolean;
  wholeWord: boolean;
  inSelection: boolean;
  /** 打开面板时捕获的选区长度；为 0 时「选区内」不可用。 */
  selectionLength: number;
  matchCount: number;
  activeIndex: number;
  invalidRegex: boolean;
  onQueryChange: (value: string) => void;
  onReplacementChange: (value: string) => void;
  onToggleCase: () => void;
  onToggleRegex: () => void;
  onToggleWholeWord: () => void;
  onToggleSelection: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onReplace: () => void;
  onReplaceAll: () => void;
  onClose: () => void;
}

export function FindBar({
  open,
  focusTarget,
  query,
  replacement,
  caseSensitive,
  regex,
  wholeWord,
  inSelection,
  selectionLength,
  matchCount,
  activeIndex,
  invalidRegex,
  onQueryChange,
  onReplacementChange,
  onToggleCase,
  onToggleRegex,
  onToggleWholeWord,
  onToggleSelection,
  onPrevious,
  onNext,
  onReplace,
  onReplaceAll,
  onClose,
}: FindBarProps) {
  const queryRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const target = focusTarget === "replace" ? replaceRef.current : queryRef.current;
    target?.focus();
    target?.select();
  }, [open, focusTarget]);

  if (!open) return null;

  const onKeyDown = (event: ReactKeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      queryRef.current?.focus();
      queryRef.current?.select();
      return;
    }
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      if (event.shiftKey) onPrevious();
      else onNext();
    }
  };

  const status = invalidRegex ? "正则有误" : matchCount > 0 ? `${activeIndex + 1}/${matchCount}` : "无结果";

  return (
    <div className="wr-findbar" role="search" aria-label="查找和替换">
      <div className="wr-findbar-row">
        <input
          ref={queryRef}
          type="search"
          className="wr-findbar-input"
          placeholder="查找"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="查找内容"
        />
        <span className={`wr-findbar-count${matchCount === 0 ? " is-empty" : ""}`} aria-live="polite">
          {status}
        </span>
        <button
          type="button"
          className="wr-button wr-button-icon"
          onClick={onPrevious}
          title="上一个 (Shift+Enter)"
          aria-label="上一个匹配"
        >
          ↑
        </button>
        <button
          type="button"
          className="wr-button wr-button-icon"
          onClick={onNext}
          title="下一个 (Enter)"
          aria-label="下一个匹配"
        >
          ↓
        </button>
        <label className="wr-find-check" title="区分大小写">
          <input type="checkbox" checked={caseSensitive} onChange={onToggleCase} />
          Aa
        </label>
        <label className="wr-find-check" title="全词匹配">
          <input type="checkbox" checked={wholeWord} onChange={onToggleWholeWord} />
          全词
        </label>
        <label className="wr-find-check" title="正则表达式">
          <input type="checkbox" checked={regex} onChange={onToggleRegex} />
          .*
        </label>
        <label
          className="wr-find-check"
          title={selectionLength > 0 ? `只在选中的 ${selectionLength} 个字符内查找` : "先在编辑器里选中一段文字"}
        >
          <input
            type="checkbox"
            checked={inSelection}
            disabled={selectionLength === 0}
            onChange={onToggleSelection}
          />
          选区内
        </label>
        <button
          type="button"
          className="wr-button wr-button-icon"
          onClick={onClose}
          title="关闭 (Esc)"
          aria-label="关闭查找"
        >
          ×
        </button>
      </div>

      <div className="wr-findbar-row">
        <input
          ref={replaceRef}
          type="text"
          className="wr-findbar-input"
          placeholder="替换为"
          value={replacement}
          onChange={(event) => onReplacementChange(event.target.value)}
          onKeyDown={onKeyDown}
          aria-label="替换内容"
        />
        <button type="button" className="wr-button" onClick={onReplace} disabled={matchCount === 0}>
          替换
        </button>
        <button type="button" className="wr-button" onClick={onReplaceAll} disabled={matchCount === 0}>
          全部替换
        </button>
      </div>
    </div>
  );
}
