import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { readZip, writeZip, type ZipEntry } from "./zip";

/**
 * Word 导出的收尾：Pandoc 只管内容和样式，下面这几件事它不做。
 *
 * 1. **只有图片的段落居中**：Pandoc 的章节/正文样式带首行缩进，图片段落会右移 2 字。
 *    模板里的 `Figure` 样式是居中、无缩进的，这里把「段内只有 drawing」的段落改成它。
 * 2. **目录域自动更新**：`--toc` 写出的是 Word 域，不更新就是一片空白。
 *    `w:updateFields` 让 Word 打开文档时自己更新，用户不用按 F9。
 * 3. **页脚页码**：参考模板只能带来样式和纸张，页眉页脚不会被 Pandoc 复制，
 *    所以在这里补一个「第 X 页 / 共 Y 页」的页脚部件。
 *
 * 三件事都是对 docx 内部 XML 的最小改动，写完立刻回写同一个文件（临时文件 + rename）。
 */

export interface DocxPolish {
  /** 让 Word 打开时更新目录域。 */
  toc?: boolean;
  /** 添加页脚页码。 */
  pageNumbers?: boolean;
}

const FOOTER_PART = "word/footer1.xml";
const FOOTER_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer";
const FOOTER_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml";

function textEntry(entries: ZipEntry[], name: string): ZipEntry | undefined {
  return entries.find((entry) => entry.name === name);
}

function readText(entries: ZipEntry[], name: string): string | null {
  const entry = textEntry(entries, name);
  return entry ? entry.data.toString("utf8") : null;
}

function writeText(entries: ZipEntry[], name: string, text: string): void {
  const entry = textEntry(entries, name);
  if (entry) entry.data = Buffer.from(text, "utf8");
  else entries.push({ name, data: Buffer.from(text, "utf8") });
}

function field(instr: string, placeholder: string, runProps: string): string {
  return [
    `<w:r>${runProps}<w:fldChar w:fldCharType="begin"/></w:r>`,
    `<w:r>${runProps}<w:instrText xml:space="preserve"> ${instr} </w:instrText></w:r>`,
    `<w:r>${runProps}<w:fldChar w:fldCharType="separate"/></w:r>`,
    `<w:r>${runProps}<w:t>${placeholder}</w:t></w:r>`,
    `<w:r>${runProps}<w:fldChar w:fldCharType="end"/></w:r>`,
  ].join("");
}

function footerXml(): string {
  const runProps =
    '<w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体" w:hAnsi="Times New Roman"/><w:color w:val="6B6459"/><w:sz w:val="18"/><w:szCs w:val="18"/></w:rPr>';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:p>
<w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="Times New Roman" w:eastAsia="宋体"/><w:color w:val="6B6459"/><w:sz w:val="18"/></w:rPr></w:pPr>
<w:r>${runProps}<w:t xml:space="preserve">第 </w:t></w:r>
${field("PAGE", "1", runProps)}
<w:r>${runProps}<w:t xml:space="preserve"> 页 / 共 </w:t></w:r>
${field("NUMPAGES", "1", runProps)}
<w:r>${runProps}<w:t xml:space="preserve"> 页</w:t></w:r>
</w:p>
</w:ftr>`;
}

function nextRelationshipId(rels: string): string {
  let max = 0;
  for (const match of rels.matchAll(/Id="rId(\d+)"/g)) {
    max = Math.max(max, Number(match[1]));
  }
  return `rId${max + 1}`;
}

function addFooterReference(documentXml: string, relId: string): string {
  const reference = `<w:footerReference w:type="default" r:id="${relId}"/>`;
  return documentXml.replace(/<w:sectPr\b([^>]*?)(\/?)>/, (_whole, attrs: string, selfClosing: string) => {
    if (selfClosing) return `<w:sectPr${attrs}>${reference}</w:sectPr>`;
    return `<w:sectPr${attrs}>${reference}`;
  });
}

function addContentType(xml: string): string {
  if (xml.includes(`PartName="/${FOOTER_PART}"`)) return xml;
  const override = `<Override PartName="/${FOOTER_PART}" ContentType="${FOOTER_CONTENT_TYPE}"/>`;
  return xml.replace("</Types>", `${override}</Types>`);
}

function addRelationship(xml: string, relId: string): string {
  const relationship = `<Relationship Id="${relId}" Type="${FOOTER_REL}" Target="footer1.xml"/>`;
  return xml.replace("</Relationships>", `${relationship}</Relationships>`);
}

/** 段落里只有一张图（没有文字）：换成居中的 Figure 样式。 */
export function centerFigureParagraphs(xml: string): string {
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!/<w:drawing\b/.test(paragraph)) return paragraph;
    if (/<w:t(?:\s[^>]*)?>[^<]</.test(paragraph)) return paragraph;
    if (/<w:pStyle w:val="(?:Figure|CaptionedFigure)"\s*\/>/.test(paragraph)) return paragraph;

    if (/<w:pStyle w:val="[^"]*"\s*\/>/.test(paragraph)) {
      return paragraph.replace(/<w:pStyle w:val="[^"]*"\s*\/>/, '<w:pStyle w:val="Figure" />');
    }
    if (/<w:pPr>/.test(paragraph)) {
      return paragraph.replace(/<w:pPr>/, '<w:pPr><w:pStyle w:val="Figure" />');
    }
    return paragraph.replace(/(<w:p\b[^>]*>)/, '$1<w:pPr><w:pStyle w:val="Figure" /></w:pPr>');
  });
}

interface Heading {
  level: number;
  text: string;
  anchor: string;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 从 document.xml 里按顺序取标题：段落样式 Heading1-6 + 紧邻的 bookmarkStart。 */
export function collectHeadings(xml: string): Heading[] {
  const headings: Heading[] = [];
  let anchor = "";

  const pattern = /<w:bookmarkStart\b[^>]*w:name="([^"]*)"[^>]*\/>|<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
  for (const match of xml.matchAll(pattern)) {
    if (match[1] !== undefined) {
      anchor = match[1];
      continue;
    }
    const paragraph = match[0];
    const style = /<w:pStyle w:val="Heading([1-6])"\s*\/>/.exec(paragraph);
    if (!style) {
      anchor = "";
      continue;
    }
    const text = [...paragraph.matchAll(/<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g)]
      .map((part) => part[1] ?? "")
      .join("");
    if (text.trim()) {
      headings.push({ level: Number(style[1]), text, anchor });
    }
    anchor = "";
  }

  return headings;
}

/**
 * 给目录域补上「缓存的条目」。
 *
 * Pandoc 写出的目录域是空的，Word 打开时**不一定**更新它（实测 `w:updateFields`
 * 只对部分域生效），于是「目录」下面一片空白。这里把标题清单填进域的缓存结果：
 * 打开文档立刻能看到可点击的条目，用户再按 F9（或打印时勾选更新域）就补上页码。
 */
export function seedTableOfContents(xml: string): string {
  if (!/<w:instrText\b[^>]*>\s*TOC\b/.test(xml)) return xml;
  const headings = collectHeadings(xml);
  if (headings.length === 0) return xml;

  const entries = headings
    .map((heading) => {
      const level = Math.min(3, Math.max(1, heading.level));
      const link = heading.anchor
        ? `<w:hyperlink w:anchor="${escapeXml(heading.anchor)}" w:history="1"><w:r><w:t xml:space="preserve">${escapeXml(heading.text)}</w:t></w:r></w:hyperlink>`
        : `<w:r><w:t xml:space="preserve">${escapeXml(heading.text)}</w:t></w:r>`;
      return `<w:p><w:pPr><w:pStyle w:val="TOC${level}"/></w:pPr>${link}</w:p>`;
    })
    .join("");

  const seeded = `<w:fldChar w:fldCharType="separate"/></w:r></w:p>${entries}<w:p><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>`;
  return xml.replace(/<w:fldChar w:fldCharType="separate"\s*\/>[\s\S]*?<\/w:p>/, seeded);
}

/** 就地把 docx 补完；除 toc / pageNumbers 外总会做图片段落居中。 */
export async function polishDocx(file: string, options: DocxPolish = {}): Promise<void> {
  const entries = readZip(await fs.readFile(file));

  const documentXml = readText(entries, "word/document.xml");
  if (documentXml) {
    let next = centerFigureParagraphs(documentXml);
    if (options.toc) next = seedTableOfContents(next);

    if (options.pageNumbers) {
      const relsPath = "word/_rels/document.xml.rels";
      const rels = readText(entries, relsPath);
      const types = readText(entries, "[Content_Types].xml");
      if (rels && types) {
        const relId = nextRelationshipId(rels);
        next = addFooterReference(next, relId);
        writeText(entries, relsPath, addRelationship(rels, relId));
        writeText(entries, "[Content_Types].xml", addContentType(types));
        writeText(entries, FOOTER_PART, footerXml());
      }
    }

    writeText(entries, "word/document.xml", next);
  }

  if (options.toc) {
    const settingsPath = "word/settings.xml";
    const settings = readText(entries, settingsPath);
    if (settings && !settings.includes("w:updateFields")) {
      writeText(
        entries,
        settingsPath,
        settings.replace("</w:settings>", '<w:updateFields w:val="true"/></w:settings>'),
      );
    }
  }

  const temporary = path.join(path.dirname(file), `.writara-${randomUUID()}.docx`);
  await fs.writeFile(temporary, writeZip(entries));
  try {
    await fs.rename(temporary, file);
  } catch {
    // 目标被 Word 占用时 rename 会失败：退回直写，别把导出的文件弄丢
    await fs.copyFile(temporary, file);
    await fs.unlink(temporary).catch(() => undefined);
  }
}
