import { describe, expect, it } from "vitest";

import { decodeBuffer, encodeText } from "../../electron/encoding";
import { formatLabel } from "./encoding";

describe("decodeBuffer", () => {
  it("普通 UTF-8（无 BOM）", () => {
    const content = decodeBuffer(Buffer.from("# 标题\n正文", "utf8"));
    expect(content).toEqual({ text: "# 标题\n正文", encoding: "utf8", bom: false });
  });

  it("UTF-8 BOM", () => {
    const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("你好", "utf8")]);
    expect(decodeBuffer(bytes)).toEqual({ text: "你好", encoding: "utf8", bom: true });
  });

  it("UTF-16 LE BOM", () => {
    const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("你好", "utf16le")]);
    expect(decodeBuffer(bytes)).toEqual({ text: "你好", encoding: "utf16le", bom: true });
  });

  it("GB18030（无 BOM）", () => {
    // 你 = C4 E3，好 = BA C3（GBK 与 GB18030 一致）
    const bytes = Buffer.from([0xc4, 0xe3, 0xba, 0xc3, 0x0a]);
    expect(decodeBuffer(bytes)).toEqual({ text: "你好\n", encoding: "gb18030", bom: false });
  });

  it("空文件按 UTF-8", () => {
    expect(decodeBuffer(Buffer.alloc(0))).toEqual({ text: "", encoding: "utf8", bom: false });
  });
});

describe("encodeText", () => {
  it("UTF-8 不写 BOM", () => {
    expect(encodeText("你好", "utf8", false).toString("hex")).toBe("e4bda0e5a5bd");
  });

  it("UTF-8 保留 BOM", () => {
    expect(encodeText("你好", "utf8", true).toString("hex")).toBe("efbbbfe4bda0e5a5bd");
  });

  it("GB18030 往返一致", () => {
    const text = "中文，测试。\n第二行";
    const bytes = encodeText(text, "gb18030", false);
    expect(bytes.toString("hex")).toBe("d6d0cec4a3acb2e2cad4a1a30ab5dab6fed0d0");
    expect(decodeBuffer(bytes)).toMatchObject({ text, encoding: "gb18030", bom: false });
  });

  it("UTF-16 LE 往返一致并带 BOM", () => {
    const text = "插图 1";
    const bytes = encodeText(text, "utf16le", true);
    expect(bytes.subarray(0, 2).toString("hex")).toBe("fffe");
    expect(decodeBuffer(bytes)).toMatchObject({ text, encoding: "utf16le", bom: true });
  });

  it("UTF-16 BE 往返一致并带 BOM", () => {
    const text = "插图 2";
    const bytes = encodeText(text, "utf16be", true);
    expect(bytes.subarray(0, 2).toString("hex")).toBe("feff");
    expect(decodeBuffer(bytes)).toMatchObject({ text, encoding: "utf16be", bom: true });
  });
});

describe("formatLabel", () => {
  it("显示编码与 BOM", () => {
    expect(formatLabel({ encoding: "utf8", bom: false })).toBe("UTF-8");
    expect(formatLabel({ encoding: "gb18030", bom: false })).toBe("GB18030");
    expect(formatLabel({ encoding: "utf8", bom: true })).toBe("UTF-8 BOM");
  });
});
