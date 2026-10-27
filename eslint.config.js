import js from "@eslint/js";
import tseslint from "typescript-eslint";

/** 主进程 / 构建脚本用到的 Node 全局；仓库没装 `globals` 包，手写一份就够。 */
const nodeGlobals = {
  process: "readonly",
  require: "readonly",
  module: "writable",
  exports: "writable",
  __dirname: "readonly",
  __filename: "readonly",
  Buffer: "readonly",
  console: "readonly",
  setTimeout: "readonly",
  clearTimeout: "readonly",
  URL: "readonly",
};

export default tseslint.config(
  { ignores: ["dist", "dev-dist", "dist-electron", "release", "coverage", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
    },
  },
  {
    files: ["electron/**/*.{ts,cjs}", "scripts/**/*.mjs", "vite.electron.config.ts"],
    languageOptions: { globals: nodeGlobals },
  },
  {
    // preload 必须是 CommonJS（sandbox: true 时 Electron 不支持 ESM preload）。
    files: ["**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
