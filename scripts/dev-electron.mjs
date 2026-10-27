import { spawn } from "node:child_process";

import electron from "electron";
import { build, createServer } from "vite";

/**
 * 桌面端开发：先编主进程，再起 Vite，最后拉起 Electron。
 *
 * 主进程代码改动后需要重启本脚本（渲染进程仍然热更新）。
 * 5173 被占用时用 `WRITARA_DEV_PORT=5174 npm run dev:electron`。
 */

const port = Number(process.env.WRITARA_DEV_PORT ?? 5173);

await build({ configFile: "vite.electron.config.ts", logLevel: "warn" });

const server = await createServer({ server: { port, strictPort: true } });
await server.listen();
server.printUrls();

const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${port}/`;

const child = spawn(electron, ["."], {
  stdio: "inherit",
  env: { ...process.env, WRITARA_DEV_SERVER_URL: url },
});

let closing = false;

async function shutdown(code) {
  if (closing) return;
  closing = true;
  await server.close().catch(() => undefined);
  process.exit(code);
}

child.on("close", (code) => void shutdown(code ?? 0));
process.on("SIGINT", () => {
  child.kill();
  void shutdown(0);
});
