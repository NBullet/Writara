/** File System Access 的目录入口与目录遍历类型补充。 */
interface FileSystemDirectoryPickerOptions {
  mode?: "read" | "readwrite";
  id?: string;
}

interface Window {
  showDirectoryPicker?: (options?: FileSystemDirectoryPickerOptions) => Promise<FileSystemDirectoryHandle>;
}

interface FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<FileSystemHandle>;
  queryPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (descriptor: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
}

/** Chromium 较新版本才有；用可选方法做特性检测。 */
interface FileSystemFileHandle {
  move?: (name: string) => Promise<void>;
  remove?: () => Promise<void>;
}
