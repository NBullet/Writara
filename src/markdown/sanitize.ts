/**
 * 打印 / 导出用的 HTML 清洗器。
 *
 * Markdown 里的行内 HTML 与 `<svg>` 会原样进入输出，这里做一次白名单处理：
 * 去掉脚本、事件属性、危险协议，保留排版需要的标签与 SVG 图形元素。
 * 只依赖 DOM（浏览器 / jsdom），纯字符串处理不可靠。
 */

/** 连同内容一起丢弃。 */
const DROP_TAGS = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "link",
  "meta",
  "base",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "audio",
  "video",
  "canvas",
  "noscript",
  "template",
  "frame",
  "frameset",
  "applet",
  "math",
  // SVG 里会执行脚本或加载外部资源的部分
  "foreignobject",
  "feimage",
  "animate",
  "animatetransform",
  "animatemotion",
  "set",
  "handler",
]);

const ALLOWED_TAGS = new Set([
  // 排版
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "div", "span", "section", "article", "nav", "aside",
  "strong", "b", "em", "i", "del", "s", "ins", "mark", "small", "sub", "sup", "kbd", "abbr", "cite", "q",
  "blockquote", "pre", "code", "ul", "ol", "li", "dl", "dt", "dd",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "caption", "colgroup", "col",
  "a", "img", "figure", "figcaption",
  "details", "summary",
  // SVG
  "svg", "g", "defs", "symbol", "use", "marker", "pattern", "switch", "desc", "title",
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textpath", "image",
  "lineargradient", "radialgradient", "stop", "clippath", "mask", "filter",
  "fegaussianblur", "feoffset", "feblend", "fecolormatrix", "femerge", "femergenode",
  "feflood", "fecomposite", "fedropshadow",
]);

/** 属性名统一小写比较。 */
const ALLOWED_ATTRS = new Set([
  "id", "class", "style", "title", "role", "lang", "dir",
  "href", "src", "alt", "loading", "decoding", "referrerpolicy",
  "width", "height", "align", "valign", "colspan", "rowspan", "scope", "span",
  "data-lang",
  "start", "type", "reversed", "open", "datetime", "cite",
  // SVG
  "xmlns", "xmlns:xlink", "version", "viewbox", "preserveaspectratio",
  "x", "y", "x1", "y1", "x2", "y2", "cx", "cy", "r", "rx", "ry", "d", "points",
  "transform", "transform-origin", "fill", "fill-opacity", "fill-rule",
  "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin",
  "stroke-dasharray", "stroke-dashoffset", "stroke-opacity", "stroke-miterlimit",
  "opacity", "clip-path", "clip-rule", "mask", "offset",
  "stop-color", "stop-opacity",
  "font-family", "font-size", "font-weight", "font-style", "font-variant",
  "text-anchor", "dominant-baseline", "letter-spacing", "word-spacing",
  "marker-start", "marker-mid", "marker-end",
  "gradientunits", "gradienttransform", "patternunits", "patterntransform",
  "spreadmethod", "fx", "fy", "stddeviation", "in", "in2", "result", "mode", "values",
]);

const URL_ATTRS = new Set(["href", "src"]);

/** 允许的 URL 协议；相对路径（无协议）也放行。 */
const SAFE_PROTOCOLS = ["http:", "https:", "blob:", "mailto:", "tel:"];

function isSafeUrl(value: string, attr: string): boolean {
  const url = value.trim();
  if (url === "" || url.startsWith("#")) return true;
  const lower = url.toLowerCase().replace(/\s/g, "");
  // javascript:/vbscript:/file: 一律拒绝；data: 只允许图片
  if (lower.startsWith("javascript:") || lower.startsWith("vbscript:") || lower.startsWith("file:")) {
    return false;
  }
  if (lower.startsWith("data:")) return lower.startsWith("data:image/");
  const scheme = /^([a-z][a-z0-9+.-]*:)/i.exec(lower);
  if (!scheme) return true; // 相对路径
  const token = scheme[1] ?? "";
  if (attr === "href" && (token === "mailto:" || token === "tel:")) return true;
  return SAFE_PROTOCOLS.includes(token);
}

function isSafeStyle(value: string): boolean {
  const style = value.toLowerCase();
  if (/expression\s*\(|javascript:|behavior\s*:|-moz-binding/.test(style)) return false;
  if (/url\s*\(/.test(style) && !/url\s*\(\s*["']?data:image\//.test(style)) return false;
  if (/position\s*:\s*fixed/.test(style)) return false;
  return true;
}

/** 图片地址是否允许（比通用 URL 更严格：data: 只放行图片）。 */
export function isSafeImageSrc(value: string): boolean {
  return isSafeUrl(value, "src");
}

function cleanAttributes(el: Element): void {
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase();
    if (name.startsWith("on") || name === "srcdoc" || name === "formaction") {
      el.removeAttribute(attr.name);
      continue;
    }
    if (!ALLOWED_ATTRS.has(name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (URL_ATTRS.has(name) && !isSafeUrl(attr.value, name)) {
      el.removeAttribute(attr.name);
      continue;
    }
    if (name === "style" && !isSafeStyle(attr.value)) {
      el.removeAttribute(attr.name);
    }
  }
}

function cleanChildren(parent: ParentNode, allowed: ReadonlySet<string>): void {
  for (const child of Array.from(parent.children)) {
    const tag = child.tagName.toLowerCase();

    if (DROP_TAGS.has(tag)) {
      child.remove();
      continue;
    }

    if (!allowed.has(tag)) {
      // 未知标签只保留内容，避免整段文字消失。
      const fragment = document.createDocumentFragment();
      while (child.firstChild) fragment.appendChild(child.firstChild);
      child.replaceWith(fragment);
      cleanChildren(parent, allowed);
      continue;
    }

    cleanAttributes(child);
    cleanChildren(child, allowed);
  }
}

/** 清洗一段 HTML 片段，返回可安全插入 DOM 的字符串。 */
export function sanitizeHtml(html: string, allowed: Set<string> = ALLOWED_TAGS): string {
  const template = document.createElement("template");
  template.innerHTML = html;
  cleanChildren(template.content, allowed);
  return template.innerHTML;
}

/**
 * 从 Markdown 的 HTML 块里取出可渲染的 `<svg>`。
 * 失败（没有 svg / 被清成空）返回 null，调用方应回退到显示源码。
 */
export function sanitizeSvg(source: string): string | null {
  const template = document.createElement("template");
  template.innerHTML = source;
  const svg = template.content.querySelector("svg");
  if (!svg) return null;

  cleanChildren(template.content, ALLOWED_TAGS);
  if (!svg.parentNode) return null;
  cleanAttributes(svg);
  const markup = svg.outerHTML.trim();
  return markup === "" ? null : markup;
}
