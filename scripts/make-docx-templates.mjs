#!/usr/bin/env node
/**
 * 生成 Word 导出的参考模板（`--reference-doc`）。
 *
 * 为什么自己拼 docx：模板是**样式与纸张**的唯一来源，必须可审查、可复现，
 * 不能把一个在 Word 里手改过的二进制当黑盒提交。docx 就是 zip + XML，
 * 这里用 node:zlib 直接写包，不引入依赖。
 *
 * 用法：npm run templates:docx
 *
 * 约定（改模板先看这里）：
 * - 每个模板只描述排版参数，样式结构由 buildStyles 统一生成，避免三份 styles.xml 走样。
 * - 行距/段前段后用 twips（1pt = 20），字号用半磅（12pt = 24），缩进用 firstLineChars 才跟字号联动。
 * - 样式 id 必须与 Pandoc docx writer 使用的一致（BodyText / FirstParagraph / Compact /
 *   SourceCode / BlockText / Table / Title / Heading1-6 / Caption / Figure / SectionNumber），
 *   写错 id 不会报错，只会静默回落到默认样式。
 */

import { deflateRawSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "..", "resources", "templates");

/* ------------------------------------------------------------------ zip */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * 最小 zip 写入器（deflate，无时间戳 / 扩展字段）。
 * docx 只要求包结构正确；不写时间，输出因此是确定性的。
 */
function zip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const [name, content] of entries) {
    const raw = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const body = deflateRawSync(raw, { level: 9 });
    const nameBytes = Buffer.from(name, "utf8");
    const crc = crc32(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 文件名
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBytes, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0x0800, 8);
    dir.writeUInt16LE(8, 10);
    dir.writeUInt16LE(0, 12);
    dir.writeUInt16LE(0, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(raw.length, 24);
    dir.writeUInt16LE(nameBytes.length, 28);
    dir.writeUInt16LE(0, 30);
    dir.writeUInt16LE(0, 32);
    dir.writeUInt16LE(0, 34);
    dir.writeUInt16LE(0, 36);
    dir.writeUInt32LE(0, 38);
    dir.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([dir, nameBytes]));

    offset += local.length + nameBytes.length + body.length;
  }

  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(central.length, 8);
  end.writeUInt16LE(central.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, directory, end]);
}

/* --------------------------------------------------------------- styles */

const FONT = {
  song: "宋体",
  hei: "黑体",
  fangsong: "仿宋_GB2312",
  xiaobiaosong: "方正小标宋简体",
  deng: "等线",
  latin: "Times New Roman",
  mono: "Consolas",
};

/** 浅色代码配色，与打印端的 highlight.js token 颜色对齐（printStyles.ts）。 */
const TOKEN = {
  keyword: "A63D24",
  string: "2F6F8F",
  number: "803522",
  comment: "8A8175",
  body: "26221D",
  muted: "6B6459",
  link: "2F6F8F",
};

const tokenStyles = (() => {
  const char = (id, rPr) =>
    `<w:style w:type="character" w:customStyle="1" w:styleId="${id}"><w:name w:val="${id}"/><w:rPr>${rPr}</w:rPr></w:style>`;
  return [
    char("NormalTok", ""),
    char("KeywordTok", `<w:color w:val="${TOKEN.keyword}"/>`),
    char("DataTypeTok", `<w:color w:val="${TOKEN.keyword}"/>`),
    char("BuiltInTok", `<w:color w:val="${TOKEN.keyword}"/>`),
    char("ControlFlowTok", `<w:color w:val="${TOKEN.keyword}"/>`),
    char("ExtensionTok", `<w:color w:val="${TOKEN.keyword}"/>`),
    char("StringTok", `<w:color w:val="${TOKEN.string}"/>`),
    char("CharTok", `<w:color w:val="${TOKEN.string}"/>`),
    char("VerbatimStringTok", `<w:color w:val="${TOKEN.string}"/>`),
    char("SpecialCharTok", `<w:color w:val="${TOKEN.string}"/>`),
    char("SpecialStringTok", `<w:color w:val="${TOKEN.string}"/>`),
    char("AttributeTok", `<w:color w:val="${TOKEN.string}"/>`),
    char("DecValTok", `<w:color w:val="${TOKEN.number}"/>`),
    char("BaseNTok", `<w:color w:val="${TOKEN.number}"/>`),
    char("FloatTok", `<w:color w:val="${TOKEN.number}"/>`),
    char("ConstantTok", `<w:color w:val="${TOKEN.number}"/>`),
    char("CommentTok", `<w:color w:val="${TOKEN.comment}"/><w:i/>`),
    char("DocumentationTok", `<w:color w:val="${TOKEN.comment}"/><w:i/>`),
    char("AnnotationTok", `<w:color w:val="${TOKEN.comment}"/><w:i/>`),
    char("CommentVarTok", `<w:color w:val="${TOKEN.comment}"/><w:i/>`),
    char("OtherTok", `<w:color w:val="${TOKEN.comment}"/>`),
    char("FunctionTok", "<w:b/>"),
    char("RegionMarkerTok", "<w:b/>"),
    char("InformationTok", "<w:b/>"),
    char("WarningTok", `<w:color w:val="${TOKEN.keyword}"/><w:b/>`),
    char("AlertTok", `<w:color w:val="${TOKEN.keyword}"/><w:b/>`),
    char("ErrorTok", `<w:color w:val="${TOKEN.keyword}"/><w:b/>`),
    char("OperatorTok", ""),
    char("VariableTok", ""),
  ].join("\n");
})();

function style(id, options) {
  const {
    name = id,
    type = "paragraph",
    basedOn = "Normal",
    next = "",
    custom = false,
    isDefault = false,
    pPr = "",
    rPr = "",
    extra = "",
  } = options;
  return `<w:style w:type="${type}"${isDefault ? ' w:default="1"' : ""}${custom ? ' w:customStyle="1"' : ""} w:styleId="${id}">
<w:name w:val="${name}"/>
${basedOn ? `<w:basedOn w:val="${basedOn}"/>\n` : ""}${next ? `<w:next w:val="${next}"/>\n` : ""}<w:qFormat/>
${pPr ? `<w:pPr>${pPr}</w:pPr>\n` : ""}${rPr ? `<w:rPr>${rPr}</w:rPr>\n` : ""}${extra}</w:style>`;
}

/** 正文字体 / 字号。 */
function bodyRPr(t) {
  return `<w:rFonts w:ascii="${t.body.latin}" w:eastAsia="${t.body.east}" w:hAnsi="${t.body.latin}" w:cs="${t.body.latin}"/><w:sz w:val="${t.body.size}"/><w:szCs w:val="${t.body.size}"/>`;
}

/** 段前段后 / 行距 / 首行缩进。 */
function bodyPPr(t) {
  return `<w:spacing w:before="${t.body.before}" w:after="${t.body.after}" w:line="${t.body.line}" w:lineRule="${t.body.rule}"/><w:ind w:firstLine="${t.body.firstLine}" w:firstLineChars="${t.body.indentChars}"/>`;
}

function headingStyle(level, t) {
  const h = t.heading[level - 1];
  const indent = h.indent
    ? `<w:ind w:firstLine="${h.indent}" w:firstLineChars="${h.indentChars ?? 200}"/>`
    : '<w:ind w:firstLine="0" w:firstLineChars="0"/>';
  return style(`Heading${level}`, {
    name: `heading ${level}`,
    next: "BodyText",
    pPr: `<w:keepNext/><w:keepLines/><w:spacing w:before="${h.before}" w:after="${h.after}" w:line="${h.line}" w:lineRule="auto"/>${
      h.center ? '<w:jc w:val="center"/>' : ""
    }${indent}<w:outlineLvl w:val="${level - 1}"/>`,
    rPr: `<w:rFonts w:ascii="${t.headingFont}" w:eastAsia="${h.east ?? t.headingFontEast}" w:hAnsi="${t.headingFont}" w:cs="${t.headingFont}"/><w:b w:val="${h.bold ? "1" : "0"}"/><w:bCs w:val="${h.bold ? "1" : "0"}"/><w:color w:val="${h.color}"/><w:sz w:val="${h.size}"/><w:szCs w:val="${h.size}"/>`,
  });
}

function buildStyles(t) {
  const code = t.code;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults>
<w:rPrDefault><w:rPr><w:rFonts w:ascii="${t.body.latin}" w:eastAsia="${t.body.east}" w:hAnsi="${t.body.latin}" w:cs="${t.body.latin}"/><w:sz w:val="${t.body.size}"/><w:szCs w:val="${t.body.size}"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:line="${t.body.line}" w:lineRule="${t.body.rule}"/></w:pPr></w:pPrDefault>
</w:docDefaults>
${style("Normal", { name: "Normal", isDefault: true, basedOn: "", pPr: bodyPPr(t), rPr: bodyRPr(t) })}
${style("DefaultParagraphFont", { name: "Default Paragraph Font", type: "character", isDefault: true, basedOn: "" })}
${style("TableNormal", {
  name: "Normal Table",
  type: "table",
  isDefault: true,
  basedOn: "",
  extra: `<w:tblPr><w:tblInd w:w="0" w:type="dxa"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar></w:tblPr>`,
})}
${style("BodyText", { name: "Body Text", rPr: bodyRPr(t), pPr: bodyPPr(t) })}
${style("FirstParagraph", { name: "First Paragraph", basedOn: "BodyText", next: "BodyText", custom: true })}
${style("Compact", {
  name: "Compact",
  basedOn: "BodyText",
  custom: true,
  pPr: `<w:spacing w:before="${t.compact.before}" w:after="${t.compact.after}" w:line="${t.body.line}" w:lineRule="${t.body.rule}"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
})}
${style("Title", {
  name: "Title",
  next: "BodyText",
  pPr: `<w:spacing w:before="${t.title.before}" w:after="${t.title.after}" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:rFonts w:ascii="${t.headingFont}" w:eastAsia="${t.headingFontEast}" w:hAnsi="${t.headingFont}"/><w:b/><w:color w:val="${TOKEN.body}"/><w:sz w:val="${t.title.size}"/><w:szCs w:val="${t.title.size}"/>`,
})}
${style("Subtitle", {
  name: "Subtitle",
  next: "BodyText",
  pPr: `<w:spacing w:before="120" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:rFonts w:eastAsia="${t.body.east}"/><w:color w:val="${TOKEN.muted}"/><w:sz w:val="${t.body.size + 6}"/>`,
})}
${style("Author", {
  name: "Author",
  next: "BodyText",
  pPr: `<w:spacing w:before="120" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:sz w:val="${Math.max(18, t.body.size - 3)}"/><w:color w:val="${TOKEN.muted}"/>`,
})}
${style("Date", {
  name: "Date",
  next: "BodyText",
  pPr: `<w:spacing w:before="0" w:after="240" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:sz w:val="${Math.max(18, t.body.size - 3)}"/><w:color w:val="${TOKEN.muted}"/>`,
})}
${Array.from({ length: 6 }, (_, index) => headingStyle(index + 1, t)).join("\n")}
${style("SectionNumber", {
  name: "Section Number",
  type: "character",
  basedOn: "DefaultParagraphFont",
  rPr: `<w:b/><w:color w:val="${TOKEN.body}"/>`,
})}
${style("SourceCode", {
  name: "Source Code",
  basedOn: "Normal",
  custom: true,
  pPr: `<w:keepLines/><w:shd w:val="clear" w:color="auto" w:fill="${code.bg}"/><w:spacing w:before="${code.before}" w:after="${code.after}" w:line="${code.line}" w:lineRule="auto"/><w:ind w:firstLine="0" w:firstLineChars="0" w:left="${code.indent}" w:right="${code.indent}"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="4" w:color="${code.border}"/><w:left w:val="single" w:sz="4" w:space="4" w:color="${code.border}"/><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${code.border}"/><w:right w:val="single" w:sz="4" w:space="4" w:color="${code.border}"/></w:pBdr>`,
  rPr: `<w:rFonts w:ascii="${FONT.mono}" w:eastAsia="${FONT.deng}" w:hAnsi="${FONT.mono}"/><w:sz w:val="${code.size}"/><w:szCs w:val="${code.size}"/>`,
})}
${style("VerbatimChar", {
  name: "Verbatim Char",
  type: "character",
  basedOn: "DefaultParagraphFont",
  rPr: `<w:rFonts w:ascii="${FONT.mono}" w:eastAsia="${FONT.deng}" w:hAnsi="${FONT.mono}"/><w:shd w:val="clear" w:color="auto" w:fill="${code.bg}"/><w:sz w:val="${Math.max(16, t.body.size - 2)}"/>`,
})}
${style("BlockText", {
  name: "Block Text",
  basedOn: "BodyText",
  next: "BodyText",
  pPr: `<w:pBdr><w:left w:val="single" w:sz="12" w:space="8" w:color="${t.quote.border}"/></w:pBdr><w:shd w:val="clear" w:color="auto" w:fill="${t.quote.bg}"/><w:spacing w:before="120" w:after="120" w:line="${t.body.line}" w:lineRule="${t.body.rule}"/><w:ind w:left="420" w:right="240" w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:color w:val="${t.quote.text}"/>`,
})}
${style("Table", {
  name: "Table",
  type: "table",
  basedOn: "TableNormal",
  extra: `<w:tblPr>
<w:tblBorders>
<w:top w:val="single" w:sz="8" w:space="0" w:color="${t.table.border}"/>
<w:left w:val="single" w:sz="4" w:space="0" w:color="${t.table.border}"/>
<w:bottom w:val="single" w:sz="8" w:space="0" w:color="${t.table.border}"/>
<w:right w:val="single" w:sz="4" w:space="0" w:color="${t.table.border}"/>
<w:insideH w:val="single" w:sz="4" w:space="0" w:color="${t.table.border}"/>
<w:insideV w:val="single" w:sz="4" w:space="0" w:color="${t.table.border}"/>
</w:tblBorders>
<w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="108" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="108" w:type="dxa"/></w:tblCellMar>
</w:tblPr>
<w:tblStylePr w:type="firstRow">
<w:rPr><w:b/></w:rPr>
<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="${t.table.head}"/><w:vAlign w:val="center"/></w:tcPr>
</w:tblStylePr>`,
})}
${style("TableCaption", {
  name: "Table Caption",
  next: "BodyText",
  pPr: `<w:spacing w:before="80" w:after="160" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:color w:val="${TOKEN.muted}"/><w:sz w:val="18"/>`,
})}
${style("ImageCaption", {
  name: "Image Caption",
  next: "BodyText",
  pPr: `<w:spacing w:before="80" w:after="160" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:color w:val="${TOKEN.muted}"/><w:sz w:val="18"/>`,
})}
${style("Figure", {
  name: "Figure",
  next: "ImageCaption",
  pPr: `<w:spacing w:before="160" w:after="0" w:line="240" w:lineRule="auto"/><w:jc w:val="center"/><w:ind w:firstLine="0" w:firstLineChars="0"/><w:keepNext/>`,
})}
${style("Caption", { name: "Caption", basedOn: "ImageCaption", next: "BodyText" })}
${style("CaptionedFigure", { name: "Captioned Figure", basedOn: "Figure", next: "ImageCaption" })}
${style("Hyperlink", {
  name: "Hyperlink",
  type: "character",
  basedOn: "DefaultParagraphFont",
  rPr: `<w:color w:val="${TOKEN.link}"/><w:u w:val="single"/>`,
})}
${style("FootnoteText", {
  name: "footnote text",
  pPr: `<w:spacing w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0" w:firstLineChars="0"/>`,
  rPr: `<w:sz w:val="${Math.max(16, t.body.size - 4)}"/>`,
})}
${style("FootnoteReference", {
  name: "footnote reference",
  type: "character",
  basedOn: "DefaultParagraphFont",
  rPr: `<w:vertAlign w:val="superscript"/>`,
})}
${style("TOCHeading", {
  name: "TOC Heading",
  next: "BodyText",
  pPr: `<w:spacing w:before="240" w:after="160" w:line="240" w:lineRule="auto"/><w:ind w:firstLine="0" w:firstLineChars="0"/><w:outlineLvl w:val="9"/>`,
  rPr: `<w:rFonts w:ascii="${t.headingFont}" w:eastAsia="${t.headingFontEast}"/><w:b/><w:sz w:val="${t.heading[1].size}"/>`,
})}
${[1, 2, 3]
  .map((level) =>
    style(`TOC${level}`, {
      name: `toc ${level}`,
      basedOn: "Normal",
      pPr: `<w:tabs><w:tab w:val="right" w:leader="dot" w:pos="${t.page.textWidth}"/></w:tabs><w:spacing w:before="0" w:after="0" w:line="300" w:lineRule="auto"/><w:ind w:left="${(level - 1) * 240}" w:firstLine="0" w:firstLineChars="0"/><w:jc w:val="left"/>`,
    }),
  )
  .join("\n")}
${tokenStyles}
</w:styles>`;
}

function buildDocument(t) {
  const { page } = t;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
<w:p/>
<w:sectPr>
<w:pgSz w:w="${page.width}" w:h="${page.height}"/>
<w:pgMar w:top="${page.top}" w:right="${page.right}" w:bottom="${page.bottom}" w:left="${page.left}" w:header="${page.header}" w:footer="${page.footer}" w:gutter="0"/>
<w:cols w:space="425"/>
</w:sectPr>
</w:body>
</w:document>`;
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const DOCUMENT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>
</Relationships>`;

const SETTINGS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:zoom w:percent="100"/>
<w:defaultTabStop w:val="420"/>
<w:characterSpacingControl w:val="doNotCompress"/>
<w:themeFontLang w:val="en-US" w:eastAsia="zh-CN"/>
</w:settings>`;

const CORE = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>Writara 导出模板</dc:title>
<dc:creator>Writara</dc:creator>
</cp:coreProperties>`;

const APP = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
<Application>Writara</Application>
</Properties>`;

/* ------------------------------------------------------------ templates */

const A4 = { width: 11906, height: 16838 };

/** 版心宽度（twips）= 纸宽 − 左右页边距，供目录制表位使用。 */
function pageOf(page) {
  return { ...page, textWidth: page.width - page.left - page.right };
}

const TEMPLATES = [
  {
    id: "writara-cn",
    label: "中文文稿",
    page: pageOf({ ...A4, top: 1440, right: 1797, bottom: 1440, left: 1797, header: 851, footer: 992 }),
    body: {
      east: FONT.song,
      latin: FONT.latin,
      size: 24,
      line: 360,
      rule: "auto",
      before: 0,
      after: 0,
      firstLine: 480,
      indentChars: 200,
    },
    compact: { before: 40, after: 40 },
    headingFont: FONT.latin,
    headingFontEast: FONT.hei,
    heading: [
      { size: 36, bold: true, color: TOKEN.body, before: 320, after: 160, line: 240 },
      { size: 32, bold: true, color: TOKEN.body, before: 280, after: 120, line: 240 },
      { size: 28, bold: true, color: TOKEN.body, before: 240, after: 100, line: 240 },
      { size: 24, bold: true, color: TOKEN.body, before: 200, after: 80, line: 240 },
      { size: 24, bold: true, color: TOKEN.body, before: 160, after: 60, line: 240 },
      { size: 21, bold: true, color: TOKEN.muted, before: 160, after: 60, line: 240 },
    ],
    title: { size: 44, before: 240, after: 200 },
    code: { size: 19, bg: "F5F3EE", border: "E2DED6", before: 120, after: 200, line: 260, indent: 0 },
    quote: { border: "DDD7CA", bg: "FAF8F3", text: TOKEN.muted },
    table: { border: "D8D3C8", head: "F2EFE7" },
  },
  {
    id: "gongwen",
    label: "公文",
    page: pageOf({ ...A4, top: 2098, right: 1474, bottom: 1984, left: 1588, header: 851, footer: 992 }),
    body: {
      east: FONT.fangsong,
      latin: FONT.latin,
      size: 32,
      line: 560,
      rule: "exact",
      before: 0,
      after: 0,
      firstLine: 640,
      indentChars: 200,
    },
    compact: { before: 0, after: 0 },
    headingFont: FONT.latin,
    headingFontEast: FONT.hei,
    heading: [
      {
        size: 44,
        bold: false,
        color: TOKEN.body,
        before: 240,
        after: 240,
        line: 240,
        center: true,
        east: FONT.xiaobiaosong,
      },
      { size: 32, bold: false, color: TOKEN.body, before: 120, after: 120, line: 240, indent: 640 },
      { size: 32, bold: false, color: TOKEN.body, before: 120, after: 120, line: 240, indent: 640 },
      { size: 32, bold: true, color: TOKEN.body, before: 120, after: 120, line: 240, indent: 640 },
      { size: 32, bold: true, color: TOKEN.body, before: 120, after: 120, line: 240, indent: 640 },
      { size: 32, bold: true, color: TOKEN.muted, before: 120, after: 120, line: 240, indent: 640 },
    ],
    title: { size: 44, before: 0, after: 320 },
    code: { size: 24, bg: "F5F3EE", border: "E2DED6", before: 120, after: 120, line: 360, indent: 120 },
    quote: { border: "DDD7CA", bg: "FAF8F3", text: TOKEN.muted },
    table: { border: "000000", head: "F2EFE7" },
  },
  {
    id: "tech",
    label: "技术文档",
    page: pageOf({ ...A4, top: 1440, right: 1440, bottom: 1440, left: 1440, header: 851, footer: 992 }),
    body: {
      east: FONT.deng,
      latin: "Calibri",
      size: 22,
      line: 320,
      rule: "auto",
      before: 0,
      after: 160,
      firstLine: 0,
      indentChars: 0,
    },
    compact: { before: 20, after: 20 },
    headingFont: "Calibri",
    headingFontEast: FONT.deng,
    heading: [
      { size: 40, bold: true, color: "1F2328", before: 360, after: 160, line: 240 },
      { size: 32, bold: true, color: "1F2328", before: 320, after: 140, line: 240 },
      { size: 26, bold: true, color: "1F2328", before: 280, after: 120, line: 240 },
      { size: 22, bold: true, color: "1F2328", before: 240, after: 100, line: 240 },
      { size: 22, bold: true, color: TOKEN.muted, before: 200, after: 80, line: 240 },
      { size: 20, bold: true, color: TOKEN.muted, before: 200, after: 80, line: 240 },
    ],
    title: { size: 48, before: 240, after: 160 },
    code: { size: 18, bg: "F6F8FA", border: "D0D7DE", before: 120, after: 200, line: 260, indent: 0 },
    quote: { border: "D0D7DE", bg: "F6F8FA", text: TOKEN.muted },
    table: { border: "D0D7DE", head: "F6F8FA" },
  },
];

function buildDocx(t) {
  return zip([
    ["[Content_Types].xml", CONTENT_TYPES],
    ["_rels/.rels", ROOT_RELS],
    ["docProps/core.xml", CORE],
    ["docProps/app.xml", APP],
    ["word/document.xml", buildDocument(t)],
    ["word/_rels/document.xml.rels", DOCUMENT_RELS],
    ["word/styles.xml", buildStyles(t)],
    ["word/settings.xml", SETTINGS],
  ]);
}

await mkdir(OUT_DIR, { recursive: true });
for (const template of TEMPLATES) {
  const file = path.join(OUT_DIR, `${template.id}.docx`);
  const buffer = buildDocx(template);
  await writeFile(file, buffer);
  console.log(`${path.relative(process.cwd(), file)}  ${(buffer.length / 1024).toFixed(1)} kB`);
}
