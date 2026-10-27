// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";

import { setImageResolver } from "../io/image-resolver";
import { resolveHtmlImages } from "./resolve-images";

afterEach(() => {
  setImageResolver(null);
});

describe("resolveHtmlImages", () => {
  it("把相对路径换成解析后的地址", async () => {
    setImageResolver(async (src) => (src === "pic.png" ? "data:image/png;base64,AAAA" : null));
    const html = await resolveHtmlImages('<p><img src="pic.png" alt="图"></p>');
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it("外部地址与解析失败时保持原样", async () => {
    setImageResolver(async () => null);
    const html = await resolveHtmlImages('<p><img src="https://example.com/a.png"><img src="missing.png"></p>');
    expect(html).toContain("https://example.com/a.png");
    expect(html).toContain("missing.png");
  });

  it("没有图片时直接返回", async () => {
    const html = "<p>正文</p>";
    expect(await resolveHtmlImages(html)).toBe(html);
  });
});
