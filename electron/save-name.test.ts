import { describe, expect, it } from "vitest";

import { exportBaseName, saveBaseName } from "./save-name";

describe("saveBaseName", () => {
  it("只留最后一个路径段", () => {
    expect(saveBaseName("03-Projects/华科/06-上报.md")).toBe("06-上报.md");
    expect(saveBaseName("03-Projects\\华科\\06-上报.md")).toBe("06-上报.md");
  });

  it("去掉 Windows 非法字符", () => {
    expect(saveBaseName('a<b>c:d"e|f?g*h.md')).toBe("a_b_c_d_e_f_g_h.md");
  });

  it("空名称退回默认值", () => {
    expect(saveBaseName("   ")).toBe("未命名");
    expect(saveBaseName("报告.md.")).toBe("报告.md");
  });
});

describe("exportBaseName", () => {
  it("去掉文档扩展名", () => {
    expect(exportBaseName("notes/报告.md")).toBe("报告");
    expect(exportBaseName("报告.MARKDOWN")).toBe("报告");
  });
});
