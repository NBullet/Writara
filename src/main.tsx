import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import { installPrintStyles, setCustomCss } from "./export/print";
import { runStartupSplash } from "./startup-splash";
import { setPlatform } from "./platform";
import { createDesktopFs, hasDesktopBridge } from "./platform/desktop";
import { PrintPreview } from "./PrintPreview";
import { applySettings, loadSettings } from "./storage/settings";
import "./styles/tokens.css";
import "./styles/themes.css";
import "./styles/app.css";
import "./styles/preferences.css";
import "./styles/print-shell.css";
import "katex/dist/katex.min.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root 未找到");

// 先选平台实现，再渲染：App 里的菜单栏、关窗拦截都按 platform().kind 分支。
if (hasDesktopBridge()) setPlatform(createDesktopFs());

// 先应用设置再渲染，避免主题闪一下。
const initialSettings = loadSettings();
applySettings(initialSettings);
setCustomCss(initialSettings.customCss);
installPrintStyles();
const printMode = new URLSearchParams(window.location.search).has("print");

// 打印预览页不需要启动动画：它本来就是按 A4 版面铺开给打印用的，遮罩会挡住真实版面。
if (printMode) document.getElementById("wr-splash")?.remove();

createRoot(container).render(
  <StrictMode>{printMode ? <PrintPreview /> : <App />}</StrictMode>,
);

// 启动过渡页：Vite 加载前由 index.html 显示静态结构，这里接管进度与收尾。
if (!printMode) runStartupSplash();
