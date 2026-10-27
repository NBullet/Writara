/**
 * 当前文档的磁盘路径（桌面端）。
 *
 * 图片拖入/粘贴时要决定「存到文档旁的 assets 目录」还是「内联成 data URL」。
 * 编辑器扩展在构造时拿不到最新的文档路径，所以用一个模块级 provider，
 * 由 App 在文档切换时更新——和 `io/image-resolver.ts` 的做法一致。
 */

let provider: () => string | null = () => null;

export function setImageTarget(next: (() => string | null) | null): void {
  provider = next ?? (() => null);
}

export function currentImageTarget(): string | null {
  try {
    return provider();
  } catch {
    return null;
  }
}
