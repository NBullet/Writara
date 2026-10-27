import { describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { centerFigureParagraphs, polishDocx, seedTableOfContents } from "./docx";
import { readZip, writeZip, type ZipEntry } from "./zip";

const IMAGE_PARAGRAPH = `<w:p><w:pPr><w:pStyle w:val="FirstParagraph" /></w:pPr><w:r><w:drawing><wp:inline/></w:drawing></w:r></w:p>`;
const TEXT_PARAGRAPH = `<w:p><w:pPr><w:pStyle w:val="BodyText" /></w:pPr><w:r><w:t>正文</w:t></w:r></w:p>`;

function sampleEntries(): ZipEntry[] {
  return [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>`,
      ),
    },
    {
      name: "word/_rels/document.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="styles" Target="styles.xml"/></Relationships>`,
      ),
    },
    {
      name: "word/settings.xml",
      data: Buffer.from(`<?xml version="1.0"?><w:settings xmlns:w="x"></w:settings>`),
    },
    {
      name: "word/document.xml",
      data: Buffer.from(
        `<?xml version="1.0"?><w:document xmlns:w="x" xmlns:r="y"><w:body>${IMAGE_PARAGRAPH}${TEXT_PARAGRAPH}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`,
      ),
    },
  ];
}

describe("docx 收尾", () => {
  it("给空目录域补缓存条目（可点击到标题书签）", () => {
    const xml = [
      `<w:sdt><w:sdtContent>`,
      `<w:p><w:pPr><w:pStyle w:val="TOCHeading" /></w:pPr><w:r><w:t>目录</w:t></w:r></w:p>`,
      `<w:p><w:r><w:fldChar w:fldCharType="begin" w:dirty="true" /><w:instrText xml:space="preserve">TOC \\o "1-3" \\h \\z \\u</w:instrText><w:fldChar w:fldCharType="separate" /><w:fldChar w:fldCharType="end" /></w:r></w:p>`,
      `</w:sdtContent></w:sdt>`,
      `<w:bookmarkStart w:id="1" w:name="第一章-概述" /><w:p><w:pPr><w:pStyle w:val="Heading1" /></w:pPr><w:r><w:t>第一章 概述</w:t></w:r></w:p>`,
      `<w:bookmarkStart w:id="2" w:name="小节" /><w:p><w:pPr><w:pStyle w:val="Heading2" /></w:pPr><w:r><w:t>1.1 小节</w:t></w:r></w:p>`,
    ].join("");

    const seeded = seedTableOfContents(xml);
    expect(seeded).toContain('<w:pStyle w:val="TOC1"/>');
    expect(seeded).toContain('<w:pStyle w:val="TOC2"/>');
    expect(seeded).toContain('w:anchor="第一章-概述"');
    expect(seeded).toContain("第一章 概述");
    expect(seeded).toContain('w:fldCharType="end"');
  });

  it("没有目录域时不动正文", () => {
    const xml = `${IMAGE_PARAGRAPH}${TEXT_PARAGRAPH}`;
    expect(seedTableOfContents(xml)).toBe(xml);
  });

  it("只给「只有图片」的段落套 Figure 样式", () => {
    const xml = centerFigureParagraphs(`${IMAGE_PARAGRAPH}${TEXT_PARAGRAPH}`);
    expect(xml).toContain('<w:pStyle w:val="Figure" />');
    expect(xml).toContain('<w:pStyle w:val="BodyText" />');
  });

  it("补目录更新标记、页脚页码与页脚关系", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "writara-docx-"));
    const file = path.join(dir, "out.docx");
    await fs.writeFile(file, writeZip(sampleEntries()));

    await polishDocx(file, { toc: true, pageNumbers: true });
    const entries = readZip(await fs.readFile(file));
    const text = (name: string) => entries.find((entry) => entry.name === name)?.data.toString("utf8") ?? "";

    expect(text("word/settings.xml")).toContain('<w:updateFields w:val="true"/>');
    expect(text("word/document.xml")).toContain("<w:footerReference");
    expect(text("word/document.xml")).toContain('<w:pStyle w:val="Figure" />');
    expect(text("word/footer1.xml")).toContain("NUMPAGES");
    expect(text("word/_rels/document.xml.rels")).toContain("rId2");
    expect(text("[Content_Types].xml")).toContain("/word/footer1.xml");

    await fs.rm(dir, { recursive: true, force: true });
  });

  it("zip 读写保持内容", () => {
    const entries = [{ name: "a/b.txt", data: Buffer.from("你好，Writara") }];
    expect(readZip(writeZip(entries))[0]?.data.toString("utf8")).toBe("你好，Writara");
  });
});
