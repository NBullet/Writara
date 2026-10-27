import { useEffect, useRef, useState } from "react";

import type { WorkspaceFile } from "../platform/types";

export interface SearchResult {
  file: WorkspaceFile;
  /** 匹配处在文件文本中的绝对位置。 */
  offset: number;
  line: number;
  preview: string;
}

interface Props {
  open: boolean;
  files: WorkspaceFile[];
  read: (file: WorkspaceFile) => Promise<string>;
  onOpen: (file: WorkspaceFile, offset: number) => void;
  onClose: () => void;
}

const MAX_RESULTS = 60;

export async function searchFiles(
  files: WorkspaceFile[],
  query: string,
  read: (file: WorkspaceFile) => Promise<string>,
  onResult?: (results: SearchResult[]) => void,
): Promise<SearchResult[]> {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];

  const results: SearchResult[] = [];

  for (const file of files) {
    if (results.length >= MAX_RESULTS) break;

    let text: string;
    try {
      text = await read(file);
    } catch {
      continue;
    }
    if (text.length > 2_000_000) continue;

    const haystack = text.toLowerCase();
    let index = haystack.indexOf(needle);

    while (index >= 0 && results.length < MAX_RESULTS) {
      const lineStart = text.lastIndexOf("\n", index) + 1;
      const lineEnd = text.indexOf("\n", index);
      const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
      const line = text.slice(0, lineStart).split("\n").length;
      results.push({
        file,
        offset: index,
        line,
        preview: lineText.trim().slice(0, 140),
      });
      index = haystack.indexOf(needle, index + needle.length);
    }

    onResult?.([...results]);
  }

  return results;
}

export function SearchDialog({ open, files, read, onOpen, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults([]);
    setSearched(false);
    const frame = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!open) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const found = await searchFiles(files, query, read, setResults);
      setResults(found);
      setSearched(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wr-palette-backdrop" onMouseDown={onClose}>
      <div
        className="wr-palette wr-search"
        role="dialog"
        aria-label="在文件夹中搜索"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form
          className="wr-search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            void run();
          }}
        >
          <input
            ref={inputRef}
            className="wr-palette-input"
            value={query}
            placeholder="在文件夹中搜索…"
            aria-label="搜索内容"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onClose();
              }
            }}
          />
          <button type="submit" className="wr-button" disabled={busy || !query.trim()}>
            {busy ? "搜索中…" : "搜索"}
          </button>
        </form>

        {results.length === 0 ? (
          <div className="wr-palette-empty">
            {busy ? (
              <p>正在搜索…</p>
            ) : files.length === 0 ? (
              <>
                <p>这个文件夹里还没有可搜索的文件</p>
                <p className="wr-palette-empty-hint">
                  先打开一个文件夹（「文件 → 打开文件夹…」）；打开单个文件时也会自动加载所在目录。
                </p>
              </>
            ) : searched && query.trim() ? (
              <>
                <p>没有找到「{query.trim()}」</p>
                <p className="wr-palette-empty-hint">
                  换个关键词试试；只想搜当前文档时按 Esc，用 Ctrl+F 在文档内查找。
                </p>
              </>
            ) : (
              <>
                <p>输入关键词后回车</p>
                <p className="wr-palette-empty-hint">
                  在当前打开的文件夹里搜索正文，结果会显示文件名与行号。
                </p>
              </>
            )}
          </div>
        ) : (
          <ul className="wr-palette-list wr-search-results">
            {results.map((result, index) => (
              <li key={`${result.file.path}-${result.offset}-${index}`}>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpen(result.file, result.offset);
                  }}
                >
                  <span className="wr-search-path">
                    {result.file.path}:{result.line}
                  </span>
                  <span className="wr-search-preview">{result.preview}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
