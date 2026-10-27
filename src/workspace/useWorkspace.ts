import { useCallback, useEffect, useState } from "react";

import { describeFileError } from "../io/file-system";
import type { TextContent } from "../io/encoding";
import { platform } from "../platform";
import type { WorkspaceAsset, WorkspaceFile, WorkspaceRoot } from "../platform/types";
import { loadSettings } from "../storage/settings";
import { clearWorkspaceRoot, loadWorkspaceRoot, saveWorkspaceRoot, clearRecentFolders, loadRecentFolders, rememberFolder, type RecentFolder } from "./store";
import { CONFIG_DIR, isConfigPath } from "./config";
import { EMPTY_PROJECT, readProject, type ProjectState } from "../project/file";

/**
 * 文件夹工作区。
 *
 * 浏览器下权限只在用户手势里申请：打开文件夹时拿一次，之后重开页面如果权限被回收，
 * 侧栏会显示「重新授权」，由用户点击触发。桌面端走系统权限，永远不需要这一步。
 */

export interface WorkspaceController {
  root: WorkspaceRoot | null;
  name: string;
  /** 文件树 / 大纲 / 搜索看到的正文文件（不含 `.writara/`）。 */
  files: WorkspaceFile[];
  /** 项目资源：图片、附件等非 Markdown 文件；只进文件树。 */
  assets: WorkspaceAsset[];
  /** `.writara/` 下的配置与扩展文件（模板、提案）；不进文件树。 */
  configFiles: WorkspaceFile[];
  /** 项目清单；`manifest` 为 null 时仍可能是「有指令文件」的项目。 */
  project: ProjectState;
  /** 有指令文件（`WRITARA.md` / `AGENTS.md`）或清单。 */
  isProject: boolean;
  /** 根节点显示名：清单 title，缺省文件夹名。 */
  projectName: string;
  busy: boolean;
  error: string | null;
  dismissError: () => void;
  needsPermission: boolean;
  openFolder: () => Promise<void>;
  /** 打开指定目录作为工作区（不弹对话框，桌面端用）。 */
  openAt: (dir: string) => Promise<void>;
  /** 打开一个已经拿到授权的根目录（新建项目用）。返回是否成功。 */
  openRoot: (root: WorkspaceRoot) => Promise<boolean>;
  /** 重新读取清单（转为项目 / 外部改动后）。 */
  reloadProject: () => Promise<void>;
  /** 最近打开过的文件夹。 */
  folders: RecentFolder[];
  openRecentFolder: (index: number) => Promise<void>;
  clearFolders: () => Promise<void>;
  refresh: () => Promise<void>;
  requestAccess: () => Promise<void>;
  closeFolder: () => Promise<void>;
  createFile: (name: string) => Promise<WorkspaceFile | null>;
  /** 删除后撤销：按原相对路径与原文重建。 */
  restoreFile: (path: string, text: string) => Promise<WorkspaceFile | null>;
  renameFile: (file: WorkspaceFile, name: string) => Promise<WorkspaceFile | null>;
  deleteFile: (file: WorkspaceFile) => Promise<boolean>;
  read: (file: WorkspaceFile) => Promise<TextContent>;
}

export function useWorkspace(): WorkspaceController {
  const [root, setRoot] = useState<WorkspaceRoot | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [assets, setAssets] = useState<WorkspaceAsset[]>([]);
  const [configFiles, setConfigFiles] = useState<WorkspaceFile[]>([]);
  const [project, setProject] = useState<ProjectState>(EMPTY_PROJECT);
  const [folders, setFolders] = useState<RecentFolder[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsPermission, setNeedsPermission] = useState(false);

  const scan = useCallback(async (target: WorkspaceRoot, options?: { quiet?: boolean }) => {
    setBusy(true);
    setError(null);
    try {
      const { scanDepth, scanFiles } = loadSettings();
      // 正文与资源同时扫描；清单必须在拿到扫描结果之后再读（指令文件是项目身份）。
      const [scanned, scannedAssets] = await Promise.all([
        platform().scan(target, {
          depth: scanDepth,
          files: scanFiles,
          // `.writara/` 默认被隐藏目录规则跳过：模板与提案必须能读到
          include: [CONFIG_DIR],
        }),
        platform()
          .scanAssets(target, { depth: scanDepth, files: Math.max(scanFiles, 600) })
          .catch(() => []),
      ]);
      const visible = scanned.filter((file) => !isConfigPath(file.path));
      setFiles(visible);
      setConfigFiles(scanned.filter((file) => isConfigPath(file.path)));
      setAssets(scannedAssets.filter((asset) => !isConfigPath(asset.path)));
      setProject(await readProject(target, visible));
      setRoot(target);
      setNeedsPermission(false);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "NotAllowedError") {
        setRoot(target);
        setNeedsPermission(true);
      } else if (!options?.quiet) {
        // 恢复上次文件夹时失败（目录被删、路径越界）不弹横幅：清掉记录即可
        setError(describeFileError(cause));
      } else {
        await clearWorkspaceRoot();
      }
    } finally {
      setBusy(false);
    }
  }, []);

  // 最近文件夹（与当前工作区分开存）。
  useEffect(() => {
    let alive = true;
    void loadRecentFolders().then((list) => {
      if (alive) setFolders(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  const remember = useCallback(async (target: WorkspaceRoot) => {
    await rememberFolder(target);
    setFolders(await loadRecentFolders());
  }, []);

  // 恢复上次的文件夹；只有权限仍然有效时自动扫描。
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const target = await loadWorkspaceRoot();
      if (!target || cancelled) return;

      // 重启后主进程白名单为空：先把上次的目录重新登记，否则 scan 会被 assertAllowed 拦下
      await platform().restoreRootAccess?.(target);

      if (await platform().canAccessRoot(target)) {
        await scan(target, { quiet: true });
        return;
      }

      setRoot(target);
      setNeedsPermission(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [scan]);

  // 目录里被外部增删了 .md：自动刷新列表（桌面端）。
  useEffect(() => {
    if (!root) return;
    return window.writara?.onWorkspaceChanged(() => {
      void scan(root);
    });
  }, [root, scan]);

  const openFolder = useCallback(async () => {
    try {
      setError(null);
      const target = await platform().chooseFolder({ mode: "readwrite", id: "writara" });
      if (!target) return;
      await saveWorkspaceRoot(target);
      await scan(target);
      void remember(target);
    } catch (cause) {
      setError(describeFileError(cause));
    }
  }, [remember, scan]);

  /** 打开某个目录（打开文件后自动加载同级目录用），不弹对话框。 */
  const openAt = useCallback(
    async (dir: string) => {
      const target = platform().rootFromPath?.(dir);
      if (!target) return;
      try {
        await saveWorkspaceRoot(target);
        await scan(target);
        void remember(target);
      } catch (cause) {
        setError(describeFileError(cause));
      }
    },
    [remember, scan],
  );

  /** 打开已经拿到授权的根目录（新建项目用），不弹对话框。 */
  const openRoot = useCallback(
    async (target: WorkspaceRoot): Promise<boolean> => {
      try {
        setError(null);
        await saveWorkspaceRoot(target);
        await scan(target);
        void remember(target);
        return true;
      } catch (cause) {
        setError(describeFileError(cause));
        return false;
      }
    },
    [remember, scan],
  );

  const reloadProject = useCallback(async () => {
    if (!root) return;
    setProject(await readProject(root, files));
  }, [root, files]);

  const openRecentFolder = useCallback(
    async (index: number) => {
      const entry = folders[index];
      if (!entry) return;
      try {
        setError(null);
        await platform().restoreRootAccess?.(entry.root);
        const allowed =
          (await platform().canAccessRoot(entry.root)) || (await platform().requestRootAccess(entry.root));
        if (!allowed) {
          setError("没有访问这个文件夹的权限，请重新选择一次");
          return;
        }
        await saveWorkspaceRoot(entry.root);
        await scan(entry.root);
        void remember(entry.root);
      } catch (cause) {
        setError(describeFileError(cause));
      }
    },
    [folders, remember, scan],
  );

  const clearFolders = useCallback(async () => {
    await clearRecentFolders();
    setFolders([]);
  }, []);

  const requestAccess = useCallback(async () => {
    if (!root) return;
    try {
      if (await platform().requestRootAccess(root)) await scan(root);
    } catch (cause) {
      setError(describeFileError(cause));
    }
  }, [root, scan]);

  const refresh = useCallback(async () => {
    if (!root) return;
    await scan(root);
  }, [root, scan]);
  const closeFolder = useCallback(async () => {
    await clearWorkspaceRoot();
    setRoot(null);
    setFiles([]);
    setAssets([]);
    setConfigFiles([]);
    setProject(EMPTY_PROJECT);
    setNeedsPermission(false);
    setError(null);
  }, []);

  const createFile = useCallback(
    async (name: string): Promise<WorkspaceFile | null> => {
      if (!root) return null;
      try {
        const file = await platform().createFile(root, name);
        await scan(root);
        return file;
      } catch (cause) {
        setError(describeFileError(cause));
        return null;
      }
    },
    [root, scan],
  );

  const read = useCallback(async (file: WorkspaceFile): Promise<TextContent> => {
    const content = await platform().read(file.ref);
    if (content === null) throw new Error("文件不存在或已被移动");
    return content;
  }, []);

  const renameFile = useCallback(
    async (file: WorkspaceFile, name: string): Promise<WorkspaceFile | null> => {
      if (!root) return null;
      try {
        const next = await platform().renameFile(root, file, name);
        await scan(root);
        return next;
      } catch (cause) {
        setError(describeFileError(cause));
        return null;
      }
    },
    [root, scan],
  );

  const deleteFile = useCallback(
    async (file: WorkspaceFile): Promise<boolean> => {
      if (!root) return false;
      try {
        await platform().deleteFile(root, file);
        await scan(root);
        return true;
      } catch (cause) {
        setError(describeFileError(cause));
        return false;
      }
    },
    [root, scan],
  );

  const restoreFile = useCallback(
    async (path: string, text: string): Promise<WorkspaceFile | null> => {
      if (!root) return null;
      try {
        const file = await platform().restoreFile(root, path, text);
        await scan(root);
        return file;
      } catch (cause) {
        setError(describeFileError(cause));
        return null;
      }
    },
    [root, scan],
  );

  const dismissError = useCallback(() => setError(null), []);

  return {
    root,
    name: root?.name ?? "",
    files,
    assets,
    configFiles,
    project,
    isProject: project.isProject,
    projectName: project.manifest?.title ?? root?.name ?? "",
    busy,
    error,
    dismissError,
    needsPermission,
    openFolder,
    openAt,
    openRoot,
    reloadProject,
    folders,
    openRecentFolder,
    clearFolders,
    refresh,
    requestAccess,
    closeFolder,
    createFile,
    restoreFile,
    renameFile,
    deleteFile,
    read,
  };
}
