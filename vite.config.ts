import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import { VitePWA } from "vite-plugin-pwa";

/** 关于页面显示的版本号：只从 package.json 取一处，避免两处漂移。 */
const VERSION = (
  JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }
).version;

export default defineConfig(({ mode }) => {
  // 桌面构建（`vite build --mode desktop`）不装 PWA：
  // 自定义协议下 Service Worker 没有意义，还会和缓存打架。
  const desktop = mode === "desktop";

  return {
    define: { __WRITARA_VERSION__: JSON.stringify(VERSION) },
    // Windows / 网络盘上 Vite 的 fs 监听经常漏事件，页面会一直跑旧模块
    // （症状：磁盘上明明改了，浏览器里报「模块没有导出 X」）。轮询更稳。
    server: {
      watch: { usePolling: true, interval: 300 },
    },
    plugins: [
      react(),
      ...(desktop
        ? []
        : [
            VitePWA({
              registerType: "autoUpdate",
              includeAssets: ["icon.svg"],
              manifest: {
                name: "Writara｜文叙",
                short_name: "Writara",
                description: "自然书写，即刻呈现 —— 一款 Typora 式的即时渲染 Markdown 编辑器",
                lang: "zh-CN",
                theme_color: "#f7f5f0",
                background_color: "#f7f5f0",
                display: "standalone",
                start_url: "/",
                icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
              },
              workbox: {
                globPatterns: ["**/*.{js,css,html,svg,woff2}"],
              },
            }),
          ]),
    ],
    test: {
      environment: "node",
      include: ["src/**/*.test.ts", "electron/**/*.test.ts"],
    },
  };
});
