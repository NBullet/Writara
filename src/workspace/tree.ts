import type { WorkspaceAsset, WorkspaceFile } from "../platform/types";

export interface TreeNode {
  name: string;
  path: string;
  file?: WorkspaceFile;
  asset?: WorkspaceAsset;
  children: TreeNode[];
}

function insert(
  root: TreeNode,
  path: string,
  leaf: Omit<TreeNode, "children">,
): void {
  const parts = path.split("/").filter(Boolean);
  let node = root;

  for (const part of parts.slice(0, -1)) {
    let child = node.children.find((entry) => !entry.file && !entry.asset && entry.name === part);
    if (!child) {
      child = { name: part, path: `${node.path}${part}/`, children: [] };
      node.children.push(child);
    }
    node = child;
  }

  node.children.push({ ...leaf, name: parts[parts.length - 1] ?? leaf.name, children: [] });
}

/**
 * 把扁平路径列表折叠成目录树：目录在前，Markdown 其次，资源最后，同类按名称排序。
 *
 * 资源（图片 / 附件）与正文共用一层目录；它们只是不能点进编辑器。
 */
export function buildFileTree(files: WorkspaceFile[], assets: WorkspaceAsset[] = []): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };

  for (const file of files) {
    insert(root, file.path, { name: file.name, path: file.path, file });
  }
  for (const asset of assets) {
    insert(root, asset.path, { name: asset.name, path: asset.path, asset });
  }

  const rank = (node: TreeNode): number => (node.file ? 1 : node.asset ? 2 : 0);
  const sort = (nodes: TreeNode[]): void => {
    nodes.sort((a, b) => {
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.name.localeCompare(b.name, "zh-CN");
    });
    for (const node of nodes) sort(node.children);
  };

  sort(root.children);
  return root.children;
}

/**
 * 文件的所有祖先文件夹路径（带结尾 `/`，与 TreeNode.path 一致）。
 *
 * `a/b/c.md` → `["a/", "a/b/"]`。用来在打开文件时自动展开它所在的目录。
 */
export function folderPathsOf(filePath: string): string[] {
  const parts = filePath.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => `${parts.slice(0, index + 1).join("/")}/`);
}
