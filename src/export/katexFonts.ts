/**
 * KaTeX 字体（woff2）内联成 data URL。
 *
 * 只有导出单文件 HTML 时才动态加载这个模块，避免 340KB 的 base64 进主包。
 * Vite 的 `?inline` 会把资源转成 data URI。
 */

import AMS from "katex/dist/fonts/KaTeX_AMS-Regular.woff2?inline";
import CaligraphicBold from "katex/dist/fonts/KaTeX_Caligraphic-Bold.woff2?inline";
import CaligraphicRegular from "katex/dist/fonts/KaTeX_Caligraphic-Regular.woff2?inline";
import FrakturBold from "katex/dist/fonts/KaTeX_Fraktur-Bold.woff2?inline";
import FrakturRegular from "katex/dist/fonts/KaTeX_Fraktur-Regular.woff2?inline";
import MainBold from "katex/dist/fonts/KaTeX_Main-Bold.woff2?inline";
import MainBoldItalic from "katex/dist/fonts/KaTeX_Main-BoldItalic.woff2?inline";
import MainItalic from "katex/dist/fonts/KaTeX_Main-Italic.woff2?inline";
import MainRegular from "katex/dist/fonts/KaTeX_Main-Regular.woff2?inline";
import MathBoldItalic from "katex/dist/fonts/KaTeX_Math-BoldItalic.woff2?inline";
import MathItalic from "katex/dist/fonts/KaTeX_Math-Italic.woff2?inline";
import SansSerifBold from "katex/dist/fonts/KaTeX_SansSerif-Bold.woff2?inline";
import SansSerifItalic from "katex/dist/fonts/KaTeX_SansSerif-Italic.woff2?inline";
import SansSerifRegular from "katex/dist/fonts/KaTeX_SansSerif-Regular.woff2?inline";
import ScriptRegular from "katex/dist/fonts/KaTeX_Script-Regular.woff2?inline";
import Size1 from "katex/dist/fonts/KaTeX_Size1-Regular.woff2?inline";
import Size2 from "katex/dist/fonts/KaTeX_Size2-Regular.woff2?inline";
import Size3 from "katex/dist/fonts/KaTeX_Size3-Regular.woff2?inline";
import Size4 from "katex/dist/fonts/KaTeX_Size4-Regular.woff2?inline";
import TypewriterRegular from "katex/dist/fonts/KaTeX_Typewriter-Regular.woff2?inline";

export const KATEX_FONT_URLS: Record<string, string> = {
  "KaTeX_AMS-Regular.woff2": AMS,
  "KaTeX_Caligraphic-Bold.woff2": CaligraphicBold,
  "KaTeX_Caligraphic-Regular.woff2": CaligraphicRegular,
  "KaTeX_Fraktur-Bold.woff2": FrakturBold,
  "KaTeX_Fraktur-Regular.woff2": FrakturRegular,
  "KaTeX_Main-Bold.woff2": MainBold,
  "KaTeX_Main-BoldItalic.woff2": MainBoldItalic,
  "KaTeX_Main-Italic.woff2": MainItalic,
  "KaTeX_Main-Regular.woff2": MainRegular,
  "KaTeX_Math-BoldItalic.woff2": MathBoldItalic,
  "KaTeX_Math-Italic.woff2": MathItalic,
  "KaTeX_SansSerif-Bold.woff2": SansSerifBold,
  "KaTeX_SansSerif-Italic.woff2": SansSerifItalic,
  "KaTeX_SansSerif-Regular.woff2": SansSerifRegular,
  "KaTeX_Script-Regular.woff2": ScriptRegular,
  "KaTeX_Size1-Regular.woff2": Size1,
  "KaTeX_Size2-Regular.woff2": Size2,
  "KaTeX_Size3-Regular.woff2": Size3,
  "KaTeX_Size4-Regular.woff2": Size4,
  "KaTeX_Typewriter-Regular.woff2": TypewriterRegular,
};
