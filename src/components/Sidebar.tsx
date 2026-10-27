import { useEffect, useRef, useState } from "react";

import type { OutlineItem } from "../markdown/outline";
import type { WorkspaceController } from "../workspace/useWorkspace";
import type { WorkspaceAsset, WorkspaceFile } from "../platform/types";
import { assetKindOf } from "../workspace/assets";
import { buildFileTree, folderPathsOf, type TreeNode } from "../workspace/tree";
import { MoreIcon, PencilIcon, PlusIcon, SearchIcon, TrashIcon, CloseIcon } from "./icons";

export type SidebarMode = "outline" | "tree";

interface Props {
  mode: SidebarMode;
  onMode: (mode: SidebarMode) => void;
  outline: OutlineItem[];
  onJump: (pos: number) => void;
  workspace: WorkspaceController;
  onOpenFile: (file: WorkspaceFile) => void;
  /** 打开资源（图片 / 附件）：桌面端交给系统默认程序。 */
  onOpenAsset: (asset: WorkspaceAsset) => void;
  onCreateFile: () => void;
  onRename: (file: WorkspaceFile, name: string) => void;
  onDeleteFile: (file: WorkspaceFile) => void;
  onSearch: () => void;
  /** 右键菜单：文件 / 文件夹 / 列表空白处。 */
  onFileMenu: (file: WorkspaceFile, event: React.MouseEvent) => void;
  onAssetMenu: (asset: WorkspaceAsset, event: React.MouseEvent) => void;
  onFolderMenu: (node: TreeNode, event: React.MouseEvent) => void;
  onBlankMenu: (event: React.MouseEvent) => void;
  /** 工作区标题右侧的「⋯」。 */
  onWorkspaceMenu: (event: React.MouseEvent) => void;
  /** 当前文档在工作区里的相对路径，用于高亮。 */
  activePath?: string | null;
  /** 窄屏抽屉：固定宽度、不能拖拽改宽。 */
  drawer?: boolean;
  /** 驱动 clamp：给编辑区留够 A4 宽度后的侧栏上限。 */
  maxWidth?: number;
  /** 宽度变化（App 用它判断三栏是否放得下）。 */
  onWidthChange?: (width: number) => void;
  /** 浮层模式下的「收起」按钮。 */
  onClose?: () => void;
}

const TABS: Array<{ mode: SidebarMode; label: string; title: string }> = [
  { mode: "outline", label: "大纲", title: "大纲 (Ctrl+Shift+1)" },
  { mode: "tree", label: "文件树", title: "文件树 (Ctrl+Shift+3)" },
];

const INDENT = 14;
const MIN_WIDTH = 200;
const MAX_WIDTH = 360;
const DEFAULT_WIDTH = 240;
const WIDTH_KEY = "writara:sidebar-width";

function initialWidth(): number {
  try {
    const value = Number(localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(value) && value >= MIN_WIDTH) return Math.min(MAX_WIDTH, value);
  } catch {
    // localStorage 在隐私模式下可能不可用；宽度退回默认值。
  }
  return DEFAULT_WIDTH;
}

function rememberWidth(width: number): void {
  try {
    localStorage.setItem(WIDTH_KEY, String(width));
  } catch {
    // 同上：记不住宽度不影响使用。
  }
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={open ? "wr-tree-chevron is-open" : "wr-tree-chevron"}
      viewBox="0 0 12 12"
      width="12"
      height="12"
      aria-hidden="true"
    >
      <path d="M4.5 2.5 L8 6 L4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg className="wr-tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M1.5 4.2c0-.5.4-.9.9-.9h3.3l1.3 1.5h6.6c.5 0 .9.4.9.9v6.4c0 .5-.4.9-.9.9H2.4a.9.9 0 0 1-.9-.9z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="wr-tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path
        d="M3.5 2.2h5.2l3.8 3.8v7.8H3.5z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
      <path d="M8.7 2.4v3.8h3.8" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function AssetIcon({ name }: { name: string }) {
  const kind = assetKindOf(name);
  if (kind === "image") {
    return (
      <svg className="wr-tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="2" y="3" width="12" height="10" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="6" cy="6.6" r="1.2" fill="currentColor" />
        <path d="M2.6 11.6 6.4 8.4l2.4 2 1.8-1.4 2.8 2.6" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (kind === "attachment") {
    return (
      <svg className="wr-tree-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <path
          d="M10.6 4.6 6 9.2a1.9 1.9 0 0 0 2.7 2.7l5-5a3.2 3.2 0 0 0-4.5-4.5L4 7.5a4.4 4.4 0 0 0 6.2 6.2l4-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return <FileIcon />;
}

function AssetRow({
  asset,
  depth,
  onOpen,
  onMenu,
}: {
  asset: WorkspaceAsset;
  depth: number;
  onOpen: () => void;
  onMenu: (event: React.MouseEvent) => void;
}) {
  return (
    <li
      className="wr-tree-row-wrap"
      onContextMenu={(event) => {
        event.preventDefault();
        onMenu(event);
      }}
    >
      <button
        type="button"
        className="wr-tree-row is-file is-asset"
        style={{ paddingLeft: 8 + depth * INDENT }}
        title={`${asset.path}（双击用系统程序打开）`}
        onDoubleClick={onOpen}
      >
        <span className="wr-tree-chevron-space" />
        <AssetIcon name={asset.name} />
        <span className="wr-tree-name">{asset.name}</span>
      </button>
    </li>
  );
}

function FileRow({
  file,
  depth,
  active,
  renaming,
  draft,
  onOpen,
  onDelete,
  onMenu,
  onStartRename,
  onDraft,
  onCommitRename,
  onCancelRename,
}: {
  file: WorkspaceFile;
  depth: number;
  active: boolean;
  renaming: boolean;
  draft: string;
  onOpen: () => void;
  onDelete: () => void;
  onMenu: (event: React.MouseEvent) => void;
  onStartRename: () => void;
  onDraft: (value: string) => void;
  onCommitRename: () => void;
  onCancelRename: () => void;
}) {
  const rowRef = useRef<HTMLLIElement>(null);
  const skipBlur = useRef(false);

  // 打开文件后把它滚进视野，不然在长目录里找不到自己在哪
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  return (
    <li
      ref={rowRef}
      className={active ? "wr-tree-row-wrap is-active" : "wr-tree-row-wrap"}
      onContextMenu={(event) => {
        event.preventDefault();
        if (!renaming) onMenu(event);
      }}
    >
      {renaming ? (
        <div className="wr-tree-row is-file is-renaming" style={{ paddingLeft: 8 + depth * INDENT }}>
          <span className="wr-tree-chevron-space" />
          <FileIcon />
          <input
            className="wr-tree-rename"
            value={draft}
            autoFocus
            spellCheck={false}
            aria-label={`重命名 ${file.path}`}
            onChange={(event) => onDraft(event.target.value)}
            onFocus={(event) => {
              const dot = event.currentTarget.value.lastIndexOf(".");
              event.currentTarget.setSelectionRange(0, dot > 0 ? dot : event.currentTarget.value.length);
            }}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                skipBlur.current = true;
                onCommitRename();
              } else if (event.key === "Escape") {
                event.preventDefault();
                skipBlur.current = true;
                onCancelRename();
              }
            }}
            onBlur={() => {
              if (!skipBlur.current) onCommitRename();
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          className={active ? "wr-tree-row is-file is-active" : "wr-tree-row is-file"}
          style={{ paddingLeft: 8 + depth * INDENT }}
          title={file.path}
          onClick={onOpen}
        >
          <span className="wr-tree-chevron-space" />
          <FileIcon />
          <span className="wr-tree-name">{file.name}</span>
        </button>
      )}
      {renaming ? null : (
        <span className="wr-tree-actions">
          <button type="button" title="重命名" aria-label={`重命名 ${file.path}`} onClick={onStartRename}>
            <PencilIcon size={14} />
          </button>
          <button type="button" title="删除" aria-label={`删除 ${file.path}`} onClick={onDelete}>
            <TrashIcon size={14} />
          </button>
        </span>
      )}
    </li>
  );
}

function TreeNodes({
  nodes,
  depth,
  activePath,
  collapsed,
  renaming,
  onToggle,
  onOpenFile,
  onOpenAsset,
  onRenameStart,
  onRenameDraft,
  onRenameCommit,
  onRenameCancel,
  onDeleteFile,
  onFileMenu,
  onAssetMenu,
  onFolderMenu,
  onNewFile,
  onRootMenu,
  project,
}: {
  nodes: TreeNode[];
  depth: number;
  project: boolean;
  activePath: string | null;
  collapsed: ReadonlySet<string>;
  renaming: { path: string; draft: string } | null;
  onToggle: (path: string) => void;
  onOpenFile: (file: WorkspaceFile) => void;
  onOpenAsset: (asset: WorkspaceAsset) => void;
  onRenameStart: (file: WorkspaceFile) => void;
  onRenameDraft: (value: string) => void;
  onRenameCommit: () => void;
  onRenameCancel: () => void;
  onDeleteFile: (file: WorkspaceFile) => void;
  onFileMenu: (file: WorkspaceFile, event: React.MouseEvent) => void;
  onAssetMenu: (asset: WorkspaceAsset, event: React.MouseEvent) => void;
  onFolderMenu: (node: TreeNode, event: React.MouseEvent) => void;
  /** 根节点的 ＋：新建文件。 */
  onNewFile: () => void;
  /** 根节点的右键与 ⋯：项目菜单（刷新 / 关闭文件夹），不是普通文件夹菜单。 */
  onRootMenu: (event: React.MouseEvent) => void;
}) {
  return (
    <ul className={depth === 0 ? "wr-tree-list" : "wr-tree-children"}>
      {nodes.map((node) => {
        if (node.file) {
          return (
            <FileRow
              key={node.path}
              file={node.file}
              depth={depth}
              active={activePath === node.path}
              renaming={renaming?.path === node.path}
              draft={renaming?.draft ?? ""}
              onOpen={() => onOpenFile(node.file!)}
              onDelete={() => onDeleteFile(node.file!)}
              onMenu={(event) => onFileMenu(node.file!, event)}
              onStartRename={() => onRenameStart(node.file!)}
              onDraft={onRenameDraft}
              onCommitRename={onRenameCommit}
              onCancelRename={onRenameCancel}
            />
          );
        }

        if (node.asset) {
          return (
            <AssetRow
              key={node.path}
              asset={node.asset}
              depth={depth}
              onOpen={() => onOpenAsset(node.asset!)}
              onMenu={(event) => onAssetMenu(node.asset!, event)}
            />
          );
        }

        // 根节点是合成出来的（path 为空）：它接管「新建文件 / 项目菜单」，
        // 右键不能落到普通文件夹菜单上。
        const isRoot = depth === 0 && node.path === "";
        const open = !collapsed.has(node.path);
        return (
          <li key={node.path || "__root"} className={isRoot ? "wr-tree-folder is-root" : "wr-tree-folder"}>
            <div className="wr-tree-row-wrap">
              <button
                type="button"
                className="wr-tree-row is-folder"
                style={{ paddingLeft: 8 + depth * INDENT }}
                title={node.path || node.name}
                aria-expanded={open}
                onClick={() => onToggle(node.path)}
                onContextMenu={(event) => {
                  event.preventDefault();
                  if (isRoot) onRootMenu(event);
                  else onFolderMenu(node, event);
                }}
              >
                <Chevron open={open} />
                <FolderIcon />
                <span className="wr-tree-name">{node.name}</span>
                {isRoot && project ? <span className="wr-tree-badge">项目</span> : null}
              </button>
              {isRoot ? (
                <span className="wr-tree-actions">
                  <button type="button" title="新建文件" aria-label="新建文件" onClick={onNewFile}>
                    <PlusIcon size={14} />
                  </button>
                  <button type="button" title="项目操作" aria-label="项目操作" onClick={onRootMenu}>
                    <MoreIcon size={14} />
                  </button>
                </span>
              ) : null}
            </div>
            {open && node.children.length > 0 ? (
              <TreeNodes
                nodes={node.children}
                depth={depth + 1}
                activePath={activePath}
                collapsed={collapsed}
                renaming={renaming}
                onToggle={onToggle}
                onOpenFile={onOpenFile}
                onOpenAsset={onOpenAsset}
                onRenameStart={onRenameStart}
                onRenameDraft={onRenameDraft}
                onRenameCommit={onRenameCommit}
                onRenameCancel={onRenameCancel}
                onDeleteFile={onDeleteFile}
                onFileMenu={onFileMenu}
                onAssetMenu={onAssetMenu}
                onFolderMenu={onFolderMenu}
                onNewFile={onNewFile}
                onRootMenu={onRootMenu}
                project={project}
              />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function Sidebar({
  mode,
  onMode,
  outline,
  onJump,
  workspace,
  onOpenFile,
  onOpenAsset,
  onCreateFile,
  onRename,
  onDeleteFile,
  onSearch,
  onFileMenu,
  onAssetMenu,
  onFolderMenu,
  onBlankMenu,
  onWorkspaceMenu,
  activePath = null,
  drawer = false,
  maxWidth,
  onWidthChange,
  onClose,
}: Props) {
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());
  const [width, setWidth] = useState(initialWidth);
  const [renaming, setRenaming] = useState<{ path: string; draft: string } | null>(null);
  const asideRef = useRef<HTMLElement>(null);

  // 窗口变窄或对话展开时只压缩显示宽度，不改用户保存的偏好；窗口恢复后自动回来。
  const displayWidth = Math.max(
    MIN_WIDTH,
    Math.min(MAX_WIDTH, maxWidth ?? MAX_WIDTH, width),
  );

  const startRename = (file: WorkspaceFile) => setRenaming({ path: file.path, draft: file.name });

  const commitRename = () => {
    const current = renaming;
    if (!current) return;
    setRenaming(null);
    const next = current.draft.trim();
    const file = workspace.files.find((entry) => entry.path === current.path);
    if (file && next && next !== file.name) onRename(file, next);
  };

  const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = asideRef.current?.offsetWidth ?? width;
    const limit = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, maxWidth ?? MAX_WIDTH));
    let next = startWidth;
    const move = (moveEvent: PointerEvent) => {
      next = Math.max(MIN_WIDTH, Math.min(limit, startWidth + moveEvent.clientX - startX));
      if (asideRef.current) asideRef.current.style.width = `${next}px`;
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      setWidth(next);
      rememberWidth(next);
      onWidthChange?.(next);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const resetWidth = () => {
    setWidth(DEFAULT_WIDTH);
    rememberWidth(DEFAULT_WIDTH);
    onWidthChange?.(DEFAULT_WIDTH);
  };

  const filtering = Boolean(query.trim());
  const needle = query.trim().toLowerCase();
  const filteredOutline = filtering
    ? outline.filter((item) => item.text.toLowerCase().includes(needle))
    : outline;
  const filteredFiles = filtering
    ? workspace.files.filter((file) => file.path.toLowerCase().includes(needle))
    : workspace.files;
  const filteredAssets = filtering
    ? workspace.assets.filter((asset) => asset.path.toLowerCase().includes(needle))
    : workspace.assets;
  const tree = buildFileTree(filteredFiles, filteredAssets);
  // 根节点由这里合成：文件树从根目录开始，根不参与 buildFileTree。
  const rootNodes: TreeNode[] = workspace.root
    ? [{ name: workspace.projectName || workspace.root.name, path: "", children: tree }]
    : [];

  // 打开文件后展开它所在的目录（只删折叠记录，不覆盖用户手动折叠的其它目录）。
  // 根也在其中：根被收起时打开文件仍然应该看见它。
  useEffect(() => {
    if (!activePath) return;
    const ancestors = ["", ...folderPathsOf(activePath)];
    setCollapsed((current) => {
      if (!ancestors.some((path) => current.has(path))) return current;
      const next = new Set(current);
      for (const path of ancestors) next.delete(path);
      return next;
    });
  }, [activePath]);

  const toggleFolder = (path: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  // 筛选时全部展开：否则命中的文件会藏在折叠的目录里
  const effectiveCollapsed = filtering ? new Set<string>() : collapsed;

  return (
    <aside
      className="wr-sidebar"
      aria-label="侧栏"
      ref={asideRef}
      style={{ width: drawer ? "min(320px, 88vw)" : displayWidth }}
    >
      <div className="wr-sidebar-tabs" role="tablist">
        <div
          className="wr-sidebar-switch"
          style={{ "--tab-index": mode === "outline" ? 0 : 1 } as React.CSSProperties}
        >
          <span className="wr-sidebar-thumb" aria-hidden="true" />
          {TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              aria-selected={mode === tab.mode}
              className={mode === tab.mode ? "is-active" : ""}
              title={tab.title}
              onClick={() => onMode(tab.mode)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button type="button" className="wr-sidebar-search" onClick={onSearch} aria-label="搜索" title="搜索 (Ctrl+Shift+F)">
          <SearchIcon size={15} />
        </button>
        {onClose ? (
          <button
            type="button"
            className="wr-sidebar-close"
            onClick={onClose}
            aria-label="收起侧栏"
            title="收起侧栏"
          >
            <CloseIcon size={16} />
          </button>
        ) : null}
      </div>

      <div className="wr-sidebar-body">
        <input
          className="wr-sidebar-filter"
          value={query}
          placeholder={mode === "outline" ? "筛选标题…" : "筛选文件…"}
          onChange={(event) => setQuery(event.target.value)}
        />

        {mode === "outline" ? (
          filteredOutline.length === 0 ? (
            <p className="wr-outline-empty">{query ? "没有匹配的标题" : "还没有标题"}</p>
          ) : (
            <ul className="wr-outline-list">
              {filteredOutline.map((item, index) => (
                <li key={`${item.from}-${index}`}>
                  <button
                    type="button"
                    className={`wr-outline-item lv${item.level}`}
                    onClick={() => onJump(item.from)}
                    title={item.text}
                  >
                    {item.text}
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : !workspace.root ? (
          <button type="button" className="wr-outline-item" onClick={() => void workspace.openFolder()}>
            打开文件夹…
          </button>
        ) : workspace.needsPermission ? (
          <button type="button" className="wr-outline-item" onClick={() => void workspace.requestAccess()}>
            重新授权文件夹
          </button>
        ) : (
          <div
            className="wr-tree"
            onContextMenu={(event) => {
              if (event.target !== event.currentTarget) return;
              event.preventDefault();
              onBlankMenu(event);
            }}
          >
            <TreeNodes
              nodes={rootNodes}
              depth={0}
              activePath={activePath}
              collapsed={effectiveCollapsed}
              renaming={renaming}
              onToggle={toggleFolder}
              onOpenFile={onOpenFile}
              onOpenAsset={onOpenAsset}
              onRenameStart={startRename}
              onRenameDraft={(draft) => setRenaming((current) => (current ? { ...current, draft } : current))}
              onRenameCommit={commitRename}
              onRenameCancel={() => setRenaming(null)}
              onDeleteFile={onDeleteFile}
              onFileMenu={onFileMenu}
              onAssetMenu={onAssetMenu}
              onFolderMenu={onFolderMenu}
              onNewFile={onCreateFile}
              onRootMenu={onWorkspaceMenu}
              project={workspace.isProject}
            />
            {filteredFiles.length + filteredAssets.length === 0 ? (
              <p className="wr-outline-empty">
                {workspace.busy
                  ? "正在读取…"
                  : filtering
                    ? "没有匹配的文件"
                    : "这个文件夹里没有 .md 文件"}
              </p>
            ) : null}
          </div>
        )}
      </div>

      {drawer ? null : (
        <div
          className="wr-sidebar-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整侧栏宽度"
          title="拖动调整宽度，双击复位"
          onPointerDown={startResize}
          onDoubleClick={resetWidth}
        />
      )}
    </aside>
  );
}
