import { useEffect, useState } from "react";

import { configurePrint, printMarkdown, renderArticle } from "./export/print";
import { SAMPLE_DOC } from "./sample";
import { loadDraft } from "./storage/draft";
import { applySettings, applyCustomCss, loadSettings } from "./storage/settings";

/**
 * ?print=1 —— 打印预览页。
 * 和打印/导出共用 renderArticle，Mermaid、代码高亮、图片解析都不会缺。
 * 纸张 / 页边距 / 字号 / 栏宽必须与设置一致，否则这里的版面和导出对不上。
 */
export function PrintPreview() {
  const [doc] = useState(() => loadDraft()?.text ?? SAMPLE_DOC);
  const [html, setHtml] = useState("");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const settings = loadSettings();
    applySettings(settings);
    applyCustomCss(settings.customCss);
    configurePrint({
      paper: settings.paper,
      margin: settings.margin,
      fontSize: settings.fontSize,
      measure: settings.measure,
    });
  }, []);

  useEffect(() => {
    let alive = true;
    setReady(false);

    void renderArticle(doc).then((result) => {
      if (!alive) return;
      setHtml(result);
      setReady(true);
    });

    return () => {
      alive = false;
    };
  }, [doc]);

  return (
    <div className="wr-print-preview">
      <div className="wr-print-preview-bar">
        <span>打印预览 · A4 · 在打印对话框里关闭「页眉和页脚」效果最接近 Typora</span>
        <button type="button" className="wr-button" disabled={!ready} onClick={() => void printMarkdown(doc)}>
          {ready ? "打印 / 另存为 PDF" : "渲染中…"}
        </button>
      </div>
      <div className="wr-sheet">
        {ready ? (
          <div dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <p className="wr-preview-loading">正在渲染图表与代码高亮…</p>
        )}
      </div>
    </div>
  );
}
