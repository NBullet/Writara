import { readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 发布到 GitHub Releases。
 *
 * 不用 electron-builder 自带的 GitHub publisher：它在 NSIS 发布时会并发执行两次
 * 「找 release → 没有就创建」，同一个 tag 会生成两个 draft，资产被拆开。
 * 这里一次性创建 release，再按顺序上传 latest.yml、安装包、blockmap。
 *
 * 用法：
 *   npm run build:electron
 *   npx electron-builder --win nsis
 *   GH_TOKEN=... node scripts/publish.mjs
 * 也可以直接 `npm run release`（package.json 里串好了）。
 *
 * 可选：`release/notes.md` 存在时作为 release 说明。
 */

const token = process.env.GH_TOKEN;
if (!token) {
  console.error("缺少 GH_TOKEN（需要 Contents: Read and write 权限）");
  process.exit(1);
}

const pkg = JSON.parse(await readFile("package.json", "utf8"));
const version = pkg.version;
const tag = `v${version}`;
const owner = "NBullet";
const repo = "Writara";
const api = "https://api.github.com";
const headers = {
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "writara-release",
  "X-GitHub-Api-Version": "2022-11-28",
};

/** 本地文件名带空格；上传后的资产名是 latest.yml 里的连字符版本。 */
const localInstaller = path.join("release", `Writara Setup ${version}.exe`);
const safeInstaller = `Writara-Setup-${version}.exe`;
const latestYml = await readFile("release/latest.yml", "utf8");
const declared = /^path:\s*(.+)$/m.exec(latestYml)?.[1]?.trim();
if (declared && declared !== safeInstaller) {
  console.warn(`latest.yml 的 path 是 ${declared}，预期 ${safeInstaller}`);
}

let notes = "";
try {
  notes = await readFile("release/notes.md", "utf8");
} catch {
  // 没有说明就写一行版本号
}
if (!notes.trim()) notes = `Writara ${tag}`;

// 同一个 tag 已经有 release 时先删掉，允许重跑；tag 本身保留。
const lookup = await fetch(`${api}/repos/${owner}/${repo}/releases/tags/${tag}`, { headers });
if (lookup.ok) {
  const existing = await lookup.json();
  const removed = await fetch(`${api}/repos/${owner}/${repo}/releases/${existing.id}`, {
    method: "DELETE",
    headers,
  });
  if (!removed.ok) throw new Error(`删除旧 release 失败：${removed.status}`);
  console.log(`deleted old release ${existing.id}`);
}

const createdResponse = await fetch(`${api}/repos/${owner}/${repo}/releases`, {
  method: "POST",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ tag_name: tag, name: tag, body: notes, draft: false, prerelease: false }),
});
const created = await createdResponse.json();
if (!createdResponse.ok || !created.id) {
  throw new Error(`创建 release 失败：${JSON.stringify(created)}`);
}
console.log(`created ${created.html_url}`);

/** 上传一个资产；重跑时 release 是新建的，不会撞名。 */
async function upload(file, name) {
  const data = await readFile(file);
  const response = await fetch(
    `https://uploads.github.com/repos/${owner}/${repo}/releases/${created.id}/assets?name=${encodeURIComponent(name)}`,
    {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/octet-stream",
        "Content-Length": String(data.length),
      },
      body: data,
    },
  );
  if (!response.ok) {
    throw new Error(`上传 ${name} 失败：${response.status} ${await response.text()}`);
  }
  console.log(`uploaded ${name}`);
}

await upload(localInstaller, safeInstaller);
await upload(`${localInstaller}.blockmap`, `${safeInstaller}.blockmap`);
await upload("release/latest.yml", "latest.yml");
console.log(`published ${tag}`);
