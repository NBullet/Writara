/**
 * 导出 PNG：把打印区按 A4 版面截图。
 *
 * 用 html-to-image（foreignObject）而不是逐个计算样式，
 * 这样字体、表格、代码块、SVG、KaTeX 的排版与打印一致。
 * 只在点击导出时加载。
 */

const A4_WIDTH_PX = 794; // 210mm @ 96dpi

export async function downloadPng(fileName: string, host: HTMLElement): Promise<void> {
  const { toPng } = await import("html-to-image");

  // .wr-png 原本把宿主放在 left:-20000px（屏幕上不可见），但 html-to-image 会把
  // 这个偏移一起克隆进 foreignObject，截出来就是一张纯白图。
  // 截图期间把它临时放回 0,0，并用负 z-index 藏在应用内容后面。
  const previous = {
    left: host.style.left,
    top: host.style.top,
    zIndex: host.style.zIndex,
  };
  host.classList.add("wr-png");
  host.style.left = "0px";
  host.style.top = "0px";
  host.style.zIndex = "-1";
  try {
    const dataUrl = await toPng(host, {
      backgroundColor: "#ffffff",
      pixelRatio: 2,
      width: A4_WIDTH_PX,
      cacheBust: true,
    });

    const anchor = document.createElement("a");
    anchor.href = dataUrl;
    anchor.download = `${fileName.replace(/\.(md|markdown|mdx|txt)$/i, "") || "未命名"}.png`;
    anchor.click();
  } finally {
    host.style.left = previous.left;
    host.style.top = previous.top;
    host.style.zIndex = previous.zIndex;
    host.classList.remove("wr-png");
  }
}

export { A4_WIDTH_PX };
