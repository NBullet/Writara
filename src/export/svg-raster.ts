/**
 * SVG → PNG：Word 不认 SVG（Pandoc 会把图写成坏图），而 Pandoc 在 Windows 上
 * 也没有内置栅格化方案（需要 rsvg-convert）。这里用 canvas 自己转一遍，
 * 代码里的 Mermaid 图、手写 SVG 在 docx / ePub 里都能正常显示。
 *
 * 只在这一条链路里用，不要拿它替换打印/预览的 SVG（那边保持矢量）。
 */

export interface RasterImage {
  /** data:image/png;base64,… */
  src: string;
  /** 视图盒宽度（px，按 96dpi） */
  width: number;
  height: number;
}

function svgSize(svg: SVGSVGElement): { width: number; height: number } {
  const box = svg.viewBox?.baseVal;
  const width = Math.max(1, Math.round(box && box.width ? box.width : svg.clientWidth || 640));
  const height = Math.max(1, Math.round(box && box.height ? box.height : svg.clientHeight || 320));
  return { width, height };
}

/** 把一个 SVG 元素画进 canvas 并返回 PNG data URL；失败返回 null。 */
export function svgElementToPng(svg: SVGSVGElement): Promise<RasterImage | null> {
  return new Promise((resolve) => {
    try {
      const { width, height } = svgSize(svg);
      const clone = svg.cloneNode(true) as SVGSVGElement;
      clone.setAttribute("width", String(width));
      clone.setAttribute("height", String(height));
      const markup = new XMLSerializer().serializeToString(clone);
      const encoded = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(markup)))}`;

      const image = new Image();
      image.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width * 2;
        canvas.height = height * 2;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }
        // Word 的纸是白的：先铺白底，避免透明 PNG 在 Word 里显成黑块
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve({ src: canvas.toDataURL("image/png"), width, height });
      };
      image.onerror = () => resolve(null);
      image.src = encoded;
    } catch {
      resolve(null);
    }
  });
}

/** SVG 字符串（Mermaid 的输出）→ PNG。 */
export async function svgMarkupToPng(markup: string): Promise<RasterImage | null> {
  // 用 template 而不是 innerHTML 直接写 body：不要触发图片/脚本加载。
  // SVG 可以保持游离状态：尺寸取 viewBox，canvas 自己画一遍就行。
  const template = document.createElement("template");
  template.innerHTML = markup;
  const svg = template.content.querySelector("svg");
  if (!svg) return null;
  return svgElementToPng(svg);
}
