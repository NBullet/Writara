/** 中英混排字数：CJK 逐字计，拉丁按词计。 */
const CJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
const LATIN_WORD = /[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g;

export function countWords(text: string): number {
  const cjk = text.match(CJK)?.length ?? 0;
  const latin = text.replace(CJK, " ").match(LATIN_WORD)?.length ?? 0;
  return cjk + latin;
}

export function countChars(text: string): number {
  return [...text].length;
}

/** 粗略阅读时长；`wpm` 由设置提供（默认 400 字/分钟）。 */
export function readingMinutes(words: number, wpm = 400): number {
  const rate = wpm > 0 ? wpm : 400;
  return Math.max(1, Math.ceil(words / rate));
}
