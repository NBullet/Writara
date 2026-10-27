import { builtinModules } from "node:module";

import { defineConfig } from "vite";

/**
 * 主进程单独打包。
 *
 * 把 `electron/*.ts` 与它引用的 `src/commands/menus.ts` 合成一个 ESM 文件，
 * 这样原生菜单与 Web 菜单共用同一份定义，不用抄第二遍。
 */
export default defineConfig({
  // SSR 构建默认把所有依赖当作 external；但安装包里没有 node_modules，
  // 所以依赖要真正打进 dist-electron（动态 import 的会单独出一个 chunk）。
  ssr: { noExternal: true },
  build: {
    ssr: true,
    outDir: "dist-electron",
    emptyOutDir: true,
    target: "node22",
    // 压缩后 main.js 从 1.25 MB 降到一半左右：主进程启动时要先解析完这个文件，
    // 体积直接算进「双击 → 出现窗口」的时间里。排查问题时看 sourcemap，不要关掉压缩。
    minify: true,
    sourcemap: true,
    // 主进程不需要 public/ 静态资源，别把 icon.svg 复制进来。
    publicDir: false,
    lib: {
      entry: "electron/main.ts",
      formats: ["es"],
      fileName: () => "main.js",
    },
    rollupOptions: {
      external: ["electron", ...builtinModules, ...builtinModules.map((name) => `node:${name}`)],
    },
  },
});
