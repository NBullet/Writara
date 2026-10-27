/**
 * 启动过渡页（Lucian #256 适配）。
 *
 * index.html 里只放静态结构与样式：Electron 的 CSP 是 `script-src 'self'`，
 * 内联脚本会被拦掉。所以进度动画与「上下分裂」在这里驱动，模块加载后立即接管。
 *
 * 退出时机由**真实就绪**决定：App 挂载完编辑器后调用 `markSplashReady()`。
 * 以前是等 `document.fonts.ready`（字体就绪跟应用能不能用没关系），
 * 再用 900ms 最短展示 + 980ms 分裂硬拖到两秒多，比真实启动慢了好几倍。
 */

/** 再快也要让启动页露一下脸，否则会闪一下反而显得闪屏。 */
const MIN_VISIBLE_MS = 250;
/** 100% 之后停顿一下再分裂（与 index.html 的 transition 对齐）。 */
const HOLD_MS = 80;
/** 分裂动画时长；必须 ≥ index.html 里 `.ws-half` 的 transition。 */
const SPLIT_MS = 640;
/** 兜底：应用没报告就绪（加载失败 / 非 App 页面）时也不能让启动页永远停住。
 *  给 30s 是因为慢机器上首帧可能要 20s 以上；提前收起会露出空白窗口，比多转一会儿更糟。 */
const FALLBACK_MS = 30_000;

/** 应用已经就绪（可能早于 runStartupSplash 执行）。 */
let readyRequested = false;
/** 当前的收尾函数；启动页移除后置空。 */
let requestFinish: (() => void) | null = null;

/**
 * 应用已经可以看了：立刻收尾启动页。
 * 由 App 在编辑器创建后的首个 effect 里调用（子组件 effect 先于父组件执行）。
 */
export function markSplashReady(): void {
  readyRequested = true;
  requestFinish?.();
}

export function runStartupSplash(): void {
  const splash = document.getElementById("wr-splash");
  if (!splash) return;
  const number = document.getElementById("ws-num");
  const fill = document.getElementById("ws-fill");
  const startedAt = Date.now();

  let value = 0;
  let goal = 68;
  let done = false;

  const paint = (): void => {
    if (number) number.textContent = String(Math.round(value));
    if (fill) fill.style.width = `${value}%`;
  };

  const timer = window.setInterval(() => {
    if (done) return;
    goal = Math.min(88, goal + Math.random() * 5);
    value += (goal - value) * 0.2;
    if (value > 98) value = 98;
    paint();
  }, 80);

  const finish = (): void => {
    if (done) return;
    done = true;
    requestFinish = null;
    window.clearInterval(timer);
    const wait = Math.max(0, MIN_VISIBLE_MS - (Date.now() - startedAt));
    window.setTimeout(() => {
      value = 100;
      paint();
      window.setTimeout(() => {
        splash.classList.add("is-done");
        window.setTimeout(() => splash.remove(), SPLIT_MS);
      }, HOLD_MS);
    }, wait);
  };

  paint();
  window.setTimeout(finish, FALLBACK_MS);

  requestFinish = finish;
  if (readyRequested) finish();
}
