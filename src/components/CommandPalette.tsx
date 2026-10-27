import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { matchCommand, type PaletteCommand, type PaletteGroup, type PaletteMatch } from "./command-match";
import { SearchIcon } from "./icons";

interface Props {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}

interface Group {
  key: PaletteGroup;
  items: Array<PaletteMatch & { index: number }>;
}

const GROUP_ORDER: PaletteGroup[] = ["recent", "command", "file", "heading"];
const GROUP_LABEL: Record<PaletteGroup, string> = {
  recent: "最近",
  command: "命令",
  file: "文件",
  heading: "标题",
};

const RECENT_KEY = "writara:palette-recent";
const RECENT_LIMIT = 6;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list.filter((id): id is string => typeof id === "string") : [];
  } catch {
    return [];
  }
}

function remember(id: string): void {
  try {
    const next = [id, ...readRecent().filter((entry) => entry !== id)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // 隐私模式下 localStorage 可能不可用；最近记录只是便利，不影响命令执行。
  }
}

function Highlight({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const marked = new Set(indices);
  const parts: ReactNode[] = [];
  let at = 0;
  while (at < text.length) {
    const on = marked.has(at);
    let end = at;
    while (end < text.length && marked.has(end) === on) end += 1;
    const chunk = text.slice(at, end);
    parts.push(on ? <mark key={at}>{chunk}</mark> : <Fragment key={at}>{chunk}</Fragment>);
    at = end;
  }
  return <>{parts}</>;
}

function buildGroups(commands: PaletteCommand[], query: string): Group[] {
  const recentIds = readRecent();
  const byGroup = new Map<PaletteGroup, PaletteMatch[]>();

  for (const command of commands) {
    if (command.hidden && !query.trim()) continue;
    const match = matchCommand(command, query);
    if (!match) continue;
    const key = command.group ?? "command";
    const list = byGroup.get(key) ?? [];
    list.push(match);
    byGroup.set(key, list);
  }

  let counter = 0;
  const groups: Group[] = [];

  if (!query.trim() && recentIds.length > 0) {
    const recent = recentIds
      .map((id) => commands.find((command) => command.id === id))
      .filter((command): command is PaletteCommand => Boolean(command))
      .slice(0, RECENT_LIMIT)
      .map((command) => ({ command, score: 0, indices: [] }));
    if (recent.length > 0) {
      groups.push({ key: "recent", items: recent.map((item) => ({ ...item, index: counter++ })) });
    }
  }

  for (const key of GROUP_ORDER) {
    if (key === "recent") continue;
    const items = byGroup.get(key);
    if (!items || items.length === 0) continue;
    const sorted = (query.trim()
      ? items.sort((a, b) => b.score - a.score || a.command.label.localeCompare(b.command.label))
      : items
    ).map((item) => ({ ...item, index: counter++ }));
    groups.push({ key, items: sorted });
  }

  return groups;
}

export function CommandPalette({ open, commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const groups = useMemo(() => buildGroups(commands, query), [commands, query, open]);
  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setIndex(0);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  useEffect(() => {
    setIndex(0);
  }, [query]);

  useEffect(() => {
    const active = listRef.current?.querySelector('[data-active="true"]');
    active?.scrollIntoView({ block: "nearest" });
  }, [index]);

  if (!open) return null;

  const run = (match: PaletteMatch | undefined) => {
    if (!match) return;
    remember(match.command.id);
    onClose();
    match.command.run();
  };

  const move = (step: number) => {
    if (flat.length === 0) return;
    setIndex((value) => (value + step + flat.length) % flat.length);
  };

  return (
    <div className="wr-palette-backdrop" onMouseDown={onClose}>
      <div
        className="wr-palette"
        role="dialog"
        aria-label="命令面板"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="wr-palette-search">
          <SearchIcon size={16} />
          <input
            ref={inputRef}
            className="wr-palette-input"
            value={query}
            placeholder="搜索命令、文件或标题…"
            aria-label="搜索命令、文件或标题"
            role="combobox"
            aria-expanded={flat.length > 0}
            aria-controls="wr-palette-listbox"
            aria-autocomplete="list"
            aria-activedescendant={flat.length > 0 ? `wr-palette-opt-${index}` : undefined}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(-1);
              } else if (event.key === "Enter") {
                event.preventDefault();
                run(flat[index]);
              } else if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <kbd className="wr-palette-esc">esc</kbd>
        </div>

        {flat.length === 0 ? (
          <div className="wr-palette-empty">
            <p>{query.trim() ? `没有找到「${query.trim()}」` : "开始输入，或从最近使用里选一条"}</p>
            <p className="wr-palette-empty-hint">
              {query.trim()
                ? "试试菜单名（如「导出」「表格」）、文件名，或正文标题。"
                : "命令按菜单名搜索，文件按文件名搜索，标题按正文标题搜索。"}
            </p>
            {query.trim() ? (
              <button type="button" className="wr-button" onClick={() => setQuery("")}>
                查看全部命令
              </button>
            ) : null}
          </div>
        ) : (
          <ul className="wr-palette-list" ref={listRef} role="listbox" id="wr-palette-listbox">
            {groups.map((group) => (
              <Fragment key={group.key}>
                <li className="wr-palette-group" role="presentation">
                  {GROUP_LABEL[group.key]}
                </li>
                {group.items.map((item) => (
                  <li
                    key={`${group.key}-${item.command.id}`}
                    id={`wr-palette-opt-${item.index}`}
                    role="option"
                    aria-selected={item.index === index}
                  >
                    <button
                      type="button"
                      className={item.index === index ? "is-active" : ""}
                      data-active={item.index === index}
                      data-command-id={item.command.id}
                      data-command-path={item.command.path}
                      onMouseEnter={() => setIndex(item.index)}
                      onClick={() => run(item)}
                    >
                      <span className="wr-palette-label">
                        <Highlight text={item.command.label} indices={item.indices} />
                      </span>
                      {item.command.path ? <span className="wr-palette-path">{item.command.path}</span> : null}
                      {item.command.hint ? <kbd>{item.command.hint}</kbd> : null}
                    </button>
                  </li>
                ))}
              </Fragment>
            ))}
          </ul>
        )}

        <div className="wr-palette-foot">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> 选择
          </span>
          <span>
            <kbd>↵</kbd> 执行
          </span>
          <span>
            <kbd>esc</kbd> 关闭
          </span>
        </div>
      </div>
    </div>
  );
}
