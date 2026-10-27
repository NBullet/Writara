import { isRelativeSrc, resolveImage } from "../io/image-resolver";

/** 单张图片的解析器；项目导出按「每章所在目录」各给一个。 */
export type ImageResolve = (src: string) => Promise<string | null> | null;

/** 打印/导出前把相对路径的图片换成工作区解析出的可访问地址。 */
export async function resolveHtmlImages(
  html: string,
  resolve: ImageResolve = resolveImage,
): Promise<string> {
  if (!html.includes("<img")) return html;

  const template = document.createElement("template");
  template.innerHTML = html;

  let changed = false;
  for (const image of Array.from(template.content.querySelectorAll("img"))) {
    const src = image.getAttribute("src") ?? "";
    if (!isRelativeSrc(src)) continue;

    const resolved = await resolve(src);
    if (!resolved) continue;
    image.setAttribute("src", resolved);
    changed = true;
  }

  return changed ? template.innerHTML : html;
}
