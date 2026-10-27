import { spawn, execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { app, ipcMain } from "electron";

/**
 * 本机 agent CLI 的检测与执行（参考 Open Design 的 runtime 层）。
 *
 * 关键取舍：CLI agent 不改用户真实文件。
 * 每次运行在 `<userData>/agent-runs/<runId>/` 里准备一个小工作区：
 *   TASK.md（用户要求 + 约束 + 项目规范）
 *   document.md（当前文档）
 * 让 agent 按它熟悉的方式读写，结束后只把 document.md 读回来，
 * 由渲染进程走 diff 审阅 / 一次 dispatch。这样既保留了 agent 的工具能力，
 * 又不破坏「AI 改动必经审阅」的约束。
 */

export interface DetectedAgent {
  id: string;
  name: string;
  path: string | null;
  version: string | null;
  available: boolean;
  /** 本版本能否直接运行（目前 OpenCode / Claude Code）。 */
  runnable: boolean;
  error?: string;
  /** 没有 CLI 的模型列表命令时给静态提示。 */
  fallbackModels: string[];
}

export interface AgentRunPayload {
  runId: string;
  agentId: string;
  model?: string;
  task: string;
  document: string;
  project?: string;
  selection?: string;
  timeoutMs?: number;
  /** 项目任务：多个文件（相对路径 + 内容）。给了它就不再读写 document。 */
  files?: AgentFilePayload[];
}

export interface AgentFilePayload {
  path: string;
  text: string;
}

export interface AgentRunResult {
  ok: boolean;
  message: string;
  document: string;
  changed: boolean;
  durationMs: number;
  error?: string;
  stdout?: string;
  stderr?: string;
  /** 项目任务：每个文件读取后的内容（未改动的也返回，便于逐文件比对）。 */
  files?: AgentFilePayload[];
}

interface AgentDefinition {
  id: string;
  name: string;
  command: string;
  runnable: boolean;
  fallbackModels: string[];
  build: (model: string | undefined, prompt: string) => string[];
  parse: (stdout: string) => string;
}

const MAX_OUTPUT = 1_000_000;
const DEFAULT_TIMEOUT = 240_000;

const AGENTS: AgentDefinition[] = [
  {
    id: "opencode",
    name: "OpenCode",
    command: "opencode",
    runnable: true,
    fallbackModels: [],
    build: (model, prompt) => [
      "run",
      "--format",
      "json",
      ...(model ? ["--model", model] : []),
      "--auto",
      prompt,
    ],
    parse: (stdout) => {
      // opencode --format json 是逐行事件；取最后一段文本
      let last = "";
      for (const line of stdout.split(/\r?\n/)) {
        const text = line.trim();
        if (!text.startsWith("{")) continue;
        try {
          const event = JSON.parse(text) as {
            type?: string;
            text?: string;
            part?: { text?: string };
            message?: { content?: string };
          };
          const value = event.part?.text ?? event.text ?? event.message?.content;
          if (typeof value === "string" && value.trim()) last = value.trim();
        } catch {
          // 非 JSON 行忽略
        }
      }
      return last;
    },
  },
  {
    id: "claude",
    name: "Claude Code",
    command: "claude",
    runnable: true,
    fallbackModels: ["sonnet", "opus", "haiku"],
    build: (model, prompt) => [
      "-p",
      prompt,
      "--output-format",
      "json",
      "--permission-mode",
      "acceptEdits",
      "--allowedTools",
      "Read",
      "Write",
      "Edit",
      ...(model ? ["--model", model] : []),
    ],
    parse: (stdout) => {
      try {
        const data = JSON.parse(stdout.trim()) as { result?: string; is_error?: boolean };
        return typeof data.result === "string" ? data.result.trim() : "";
      } catch {
        return "";
      }
    },
  },
  {
    id: "codex",
    name: "Codex CLI",
    command: "codex",
    runnable: false,
    fallbackModels: ["gpt-5-codex", "gpt-5", "o3", "o4-mini"],
    build: () => [],
    parse: () => "",
  },
  {
    id: "gemini",
    name: "Gemini CLI",
    command: "gemini",
    runnable: false,
    fallbackModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    build: () => [],
    parse: () => "",
  },
  {
    id: "qwen",
    name: "Qwen Code",
    command: "qwen",
    runnable: false,
    fallbackModels: ["qwen3-coder-plus", "qwen3-coder-flash"],
    build: () => [],
    parse: () => "",
  },
  {
    id: "cursor-agent",
    name: "Cursor Agent",
    command: "cursor-agent",
    runnable: false,
    fallbackModels: ["auto", "sonnet-4", "sonnet-4-thinking", "gpt-5"],
    build: () => [],
    parse: () => "",
  },
];

const running = new Map<string, ReturnType<typeof spawn>>();

let cached: { at: number; agents: DetectedAgent[] } | null = null;
const CACHE_MS = 60_000;

export async function detectAgents(force = false): Promise<DetectedAgent[]> {
  if (!force && cached && Date.now() - cached.at < CACHE_MS) return cached.agents;
  const agents = await Promise.all(
    AGENTS.map(async (definition): Promise<DetectedAgent> => {
      const resolved = await resolveCommand(definition.command);
      if (!resolved) {
        return {
          id: definition.id,
          name: definition.name,
          path: null,
          version: null,
          available: false,
          runnable: definition.runnable,
          fallbackModels: definition.fallbackModels,
        };
      }
      const version = await capture(resolved, ["--version"], 6000);
      return {
        id: definition.id,
        name: definition.name,
        path: resolved,
        version: version.text.split(/\r?\n/)[0]?.trim() || null,
        available: true,
        runnable: definition.runnable,
        fallbackModels: definition.fallbackModels,
      };
    }),
  );
  cached = { at: Date.now(), agents };
  return agents;
}

/** 列出某个 CLI 的模型（能列就列，列不出来返回空数组）。 */
export async function agentModels(agentId: string): Promise<string[]> {
  const definition = AGENTS.find((entry) => entry.id === agentId);
  if (!definition) return [];
  const resolved = await resolveCommand(definition.command);
  if (!resolved) return [];
  if (definition.id === "opencode") {
    const result = await capture(resolved, ["models"], 20_000);
    if (!result.ok) return definition.fallbackModels;
    return result.text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && !/\s/.test(line));
  }
  return definition.fallbackModels;
}

export async function runAgent(payload: AgentRunPayload): Promise<AgentRunResult> {
  const started = Date.now();
  const definition = AGENTS.find((entry) => entry.id === payload.agentId);
  if (!definition) return fail(started, "未知的 agent");
  if (!definition.runnable) {
    return fail(started, `${definition.name} 已检测到，但本版本只支持运行 OpenCode / Claude Code`);
  }
  const resolved = await resolveCommand(definition.command);
  if (!resolved) return fail(started, `没有找到 ${definition.name} 的命令行工具`);

  const runDir = path.join(app.getPath("userData"), "agent-runs", safeId(payload.runId));
  const documentPath = path.join(runDir, "document.md");
  const taskPath = path.join(runDir, "TASK.md");
  const projectFiles = (payload.files ?? []).filter((file) => safeRunPath(runDir, file.path));

  try {
    await fs.mkdir(runDir, { recursive: true });
    if (projectFiles.length) {
      for (const file of projectFiles) {
        const target = safeRunPath(runDir, file.path)!;
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, file.text, "utf8");
      }
      await fs.writeFile(documentPath, "", "utf8");
    } else {
      await fs.writeFile(documentPath, payload.document, "utf8");
    }
    await fs.writeFile(
      taskPath,
      composeTask(projectFiles.length ? { ...payload, files: projectFiles } : payload),
      "utf8",
    );
    if (payload.project?.trim()) {
      await fs.writeFile(path.join(runDir, "WRITARA.md"), payload.project, "utf8");
    }

    const prompt = projectFiles.length
      ? "你是一个写作 agent。请阅读当前目录下的 TASK.md，按它修改列出的文件（保留原有目录结构）。" +
        "只改列出的文件；完成后用一句话说明改动，不要贴出全文。"
      : "你是一个写作 agent。请阅读当前目录下的 TASK.md，严格按照它修改 document.md。" +
        "只修改 document.md；完成后用一句话说明改动，不要贴出全文。";
    const args = definition.build(payload.model, prompt);
    const command = await commandForPath(resolved, args);
    const child = spawn(command.file, command.args, {
      cwd: runDir,
      windowsHide: true,
      windowsVerbatimArguments: command.verbatim === true,
      env: { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0", TERM: "dumb" },
    });
    // 必须关掉 stdin：opencode run 等 CLI 会等 stdin 结束才真正开始
    child.stdin?.end();
    running.set(payload.runId, child);

    const stdout = collect(child.stdout);
    const stderr = collect(child.stderr);
    const exit = await waitForExit(child, payload.timeoutMs ?? DEFAULT_TIMEOUT);
    running.delete(payload.runId);

    let next = payload.document;
    try {
      next = await fs.readFile(documentPath, "utf8");
    } catch {
      // agent 可能删掉了文件：按未修改处理
    }

    let files: AgentFilePayload[] | undefined;
    if (projectFiles.length) {
      files = [];
      for (const file of projectFiles) {
        const target = safeRunPath(runDir, file.path)!;
        let text = file.text;
        try {
          text = await fs.readFile(target, "utf8");
        } catch {
          // 文件被删：按未修改处理，避免把删除当成空文档写回
        }
        files.push({ path: file.path, text });
      }
    }

    const changed = files
      ? files.some((file) => file.text !== projectFiles.find((input) => input.path === file.path)?.text)
      : next !== payload.document;
    const parsed = definition.parse(stdout.text).trim();
    const message = parsed || (changed ? "已完成修改。" : "没有改动文档。");

    return {
      ok: exit.ok,
      message,
      document: files ? "" : next,
      changed: exit.ok ? changed : false,
      durationMs: Date.now() - started,
      error: exit.ok ? undefined : (exit.reason ?? stderr.text.trim().slice(0, 600)),
      stdout: truncate(stdout.text),
      stderr: truncate(stderr.text),
      files,
    };
  } catch (cause) {
    return fail(started, cause instanceof Error ? cause.message : "运行失败");
  } finally {
    running.delete(payload.runId);
    await fs.rm(runDir, { recursive: true, force: true }).catch(() => undefined);
  }
}

export function cancelAgent(runId: string): boolean {
  const child = running.get(runId);
  if (!child) return false;
  killTree(child);
  running.delete(runId);
  return true;
}

function composeTask(payload: AgentRunPayload): string {
  const files = payload.files ?? [];
  const listing = files.map((file) => `- ${file.path}`).join("\n");
  return [
    "# 写作任务",
    "",
    "## 用户要求",
    payload.task.trim(),
    "",
    payload.selection?.trim()
      ? `## 用户选中的内容（优先处理）\n${payload.selection.trim()}\n`
      : "",
    files.length ? `## 要修改的文件（相对当前目录）\n${listing}\n` : "",
    "## 约束",
    files.length
      ? "- 只修改上面列出的文件；不要新建、删除或重命名文件，不要改变目录结构。"
      : "- 只修改 document.md，不要新建其他文件（除非用户明确要求）。",
    "- 保持 Markdown 结构：标题层级、列表、表格、公式、Mermaid、链接与图片标记原样。",
    "- 不用 emoji；不写「总之 / 综上所述」式过渡；结尾不打圆场。",
    "- 改动尽量克制，只动用户要求的部分。",
    "- 完成后用一句话说明改了什么，不要贴全文。",
    "",
    payload.project?.trim() ? `## 项目写作规范（WRITARA.md）\n${payload.project.trim()}\n` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function fail(started: number, message: string): AgentRunResult {
  return {
    ok: false,
    message: "运行失败",
    document: "",
    changed: false,
    durationMs: Date.now() - started,
    error: message,
  };
}

function truncate(text: string): string {
  return text.length > 4000 ? `${text.slice(0, 4000)}\n……（已截断）` : text;
}

function safeId(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 64) || "run";
}

/**
 * 项目任务的文件落点：只允许 runDir 内的相对路径。
 * 越界（`..`、绝对路径、盘符）返回 null，调用方直接跳过该文件。
 */
function safeRunPath(runDir: string, relative: string): string | null {
  const cleaned = String(relative ?? "").replace(/\\/g, "/").replace(/^\/+/, "");
  const parts = cleaned.split("/");
  if (
    !cleaned ||
    parts.some((part) => !part || part === "." || part === ".." || /^[a-zA-Z]:/.test(part) || part.includes(":"))
  ) {
    return null;
  }
  const abs = path.resolve(runDir, cleaned);
  const base = path.resolve(runDir);
  if (abs !== base && !abs.startsWith(`${base}${path.sep}`)) return null;
  return abs;
}

function collect(stream: NodeJS.ReadableStream | null): { get text(): string } {
  let text = "";
  const state = {
    get text() {
      return text;
    },
  };
  stream?.on("data", (chunk: Buffer) => {
    if (text.length >= MAX_OUTPUT) return;
    text += chunk.toString("utf8");
    if (text.length > MAX_OUTPUT) text = text.slice(0, MAX_OUTPUT);
  });
  return state;
}

function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<{ ok: boolean; reason?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: { ok: boolean; reason?: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      killTree(child);
      finish({ ok: false, reason: "运行超时（可在设置里调大超时，或拆小任务）" });
    }, timeoutMs);
    child.on("error", (error) => finish({ ok: false, reason: error.message }));
    child.on("close", (code) => {
      if (code === 0) finish({ ok: true });
      else finish({ ok: false, reason: `CLI 退出码 ${code ?? "未知"}` });
    });
  });
}

function killTree(child: ReturnType<typeof spawn>): void {
  if (!child.pid) return;
  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      windowsHide: true,
      stdio: "ignore",
    });
    killer.on("error", () => child.kill());
    return;
  }
  child.kill("SIGTERM");
  setTimeout(() => child.kill("SIGKILL"), 2000);
}

function commandFor(
  executable: string,
  args: string[],
): { file: string; args: string[]; verbatim?: boolean } {
  if (/\.ps1$/i.test(executable)) {
    return {
      file: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", executable, ...args],
    };
  }
  if (/\.(cmd|bat)$/i.test(executable)) {
    // cmd /c 的引号规则要求整体再包一层；配合 windowsVerbatimArguments 才不会被 Node 二次转义
    const quoted = args.map(quoteCmdArg).join(" ");
    return {
      file: "cmd.exe",
      args: ["/d", "/s", "/c", `""${executable}" ${quoted}"`],
      verbatim: true,
    };
  }
  return { file: executable, args };
}

/**
 * npm 全局安装的 `.cmd` 只是一层包装（`"%dp0%\node_modules\...\cli.exe" %*`）。
 *
 * 直接执行 cmd 会让需要控制台输入的 CLI 卡住（opencode run 等 stdin），
 * 所以优先解析出真实 exe 直接 spawn；解析失败再退回 cmd 形式。
 */
async function commandForPath(
  executable: string,
  args: string[],
): Promise<{ file: string; args: string[]; verbatim?: boolean }> {
  if (!/\.(cmd|bat)$/i.test(executable)) return commandFor(executable, args);
  try {
    const text = await fs.readFile(executable, "utf8");
    const dir = path.dirname(executable);
    const match =
      /%dp0%\\([^"\r\n]+\.exe)/i.exec(text) ?? /"([^"\r\n]+\.exe)"/i.exec(text);
    const relative = match?.[1]?.replace(/\\/g, path.sep);
    if (relative) {
      const target = path.isAbsolute(relative) ? relative : path.join(dir, relative);
      if (/\.exe$/i.test(target)) {
        await fs.access(target);
        return { file: target, args };
      }
    }
  } catch {
    // 解析失败：退回 cmd 包装
  }
  return commandFor(executable, args);
}

function quoteCmdArg(value: string): string {
  const escaped = value.replace(/"/g, '""').replace(/%/g, "%%");
  return `"${escaped}"`;
}

async function resolveCommand(command: string): Promise<string | null> {
  const result = await capture(process.platform === "win32" ? "where.exe" : "which", [command], 6000);
  if (!result.ok) return null;
  const candidates = result.text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!candidates.length) return null;
  return (
    candidates.find((entry) => /\.exe$/i.test(entry)) ??
    candidates.find((entry) => /\.cmd$/i.test(entry)) ??
    candidates[0] ??
    null
  );
}

function capture(
  file: string,
  args: string[],
  timeoutMs: number,
): Promise<{ ok: boolean; text: string }> {
  return new Promise((resolve) => {
    void (async () => {
      // where.exe / --version 这类短命令：.cmd 包装要先解析真实 exe，否则 Node 不能直接执行
      const command = await commandForPath(file, args);
      execFile(
        command.file,
        command.args,
        {
          timeout: timeoutMs,
          windowsHide: true,
          windowsVerbatimArguments: command.verbatim === true,
          maxBuffer: 512 * 1024,
        },
        (error, stdout) => {
          if (error) resolve({ ok: false, text: String(stdout ?? "") });
          else resolve({ ok: true, text: String(stdout ?? "") });
        },
      );
    })();
  });
}

/** 注册 AI agent 的 IPC（与文件 IPC 分开：只读检测、写临时目录、不碰用户文件）。 */
export function registerAiIpc(): void {
  ipcMain.handle("ai:detect", async (_event, force?: boolean) => detectAgents(force === true));
  ipcMain.handle("ai:models", async (_event, agentId: string) => agentModels(String(agentId ?? "")));
  ipcMain.handle("ai:run", async (_event, payload: AgentRunPayload) => runAgent(payload));
  ipcMain.handle("ai:cancel", async (_event, runId: string) => cancelAgent(String(runId ?? "")));
}
