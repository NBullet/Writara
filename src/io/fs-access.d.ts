/** File System Access API 的最小类型补充（lib.dom 里还没有这些入口）。 */
interface FilePickerType {
  description?: string;
  accept: Record<string, string[]>;
}

interface Window {
  showOpenFilePicker?: (options?: {
    types?: FilePickerType[];
    multiple?: boolean;
    excludeAcceptAllOption?: boolean;
  }) => Promise<FileSystemFileHandle[]>;
  showSaveFilePicker?: (options?: {
    suggestedName?: string;
    types?: FilePickerType[];
  }) => Promise<FileSystemFileHandle>;
}
