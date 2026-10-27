/**
 * @codemirror/language-data 的 package.json 只有 import/require 条件，
 * 没有 types 条件；在 moduleResolution=bundler 下 TS 找不到声明，这里补一份。
 */
declare module "@codemirror/language-data" {
  import type { LanguageDescription } from "@codemirror/language";

  export const languages: readonly LanguageDescription[];
}
