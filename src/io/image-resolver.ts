/**
 * 图片地址解析：工作区里的相对路径 → blob URL。
 *
 * 只有「从文件夹打开」的文档才有解析器；单独打开的 .md 文件拿不到同级目录，
 * 相对路径会显示为占位。
 */

export type ImageResolver = (src: string) => Promise<string | null>;

let resolver: ImageResolver | null = null;
/** 解析器每换一次就自增，让已经渲染的图片 widget 重建而不是复用旧 DOM。 */
let generation = 0;
const cache = new Map<string, Promise<string | null>>();

export function isRelativeSrc(src: string): boolean {
  const value = src.trim();
  return value !== "" && !/^(?:[a-z][a-z0-9+.-]*:|\/\/|\/)/i.test(value);
}

export function setImageResolver(next: ImageResolver | null): void {
  resolver = next;
  generation += 1;
  clearImageCache();
}

export function imageResolverGeneration(): number {
  return generation;
}

/** 图片文件 → data URL；读取失败返回 null。 */
export function fileToDataUrl(file: File): Promise<string | null> {
  return new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

export function resolveImage(src: string): Promise<string | null> | null {
  if (!resolver) return null;

  let pending = cache.get(src);
  if (!pending) {
    pending = resolver(src).catch(() => null);
    cache.set(src, pending);
  }
  return pending;
}

/** 切换文档时调用：释放上一份文档的 blob URL。 */
export function clearImageCache(): void {
  for (const pending of cache.values()) {
    void pending.then((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  }
  cache.clear();
}
