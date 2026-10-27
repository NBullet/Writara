import type { Settings } from "../storage/settings";

/**
 * AI 端点接入（唯一入口）。
 *
 * 模型由机构配置，本工具不负责部署：端点地址 / 模型 / Key 都在偏好设置里。
 * 协议取 OpenAI 兼容的 `/chat/completions`——机构网关基本都认它。
 * 请求从渲染进程直接发出，桌面端没有 CORS 限制；Web 端的 CORS 由网关方负责。
 *
 * 响应按流式（SSE）解析；个别网关忽略 stream 参数返回整段 JSON，也一并接住。
 */

export interface AiConfig {
  endpoint: string;
  model: string;
  apiKey: string;
  /** 额外请求头（从设置里的逐行文本解析）。 */
  headers: Record<string, string>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** assistant 消息里附带的工具调用（OpenAI 兼容格式）。 */
  tool_calls?: ToolCallPayload[];
  /** role = "tool" 时对应的调用 id。 */
  tool_call_id?: string;
}

export interface ToolCallPayload {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface ToolCompletion {
  content: string;
  toolCalls: ToolCallPayload[];
}

/**
 * 解析「每行一个 Name: Value」的请求头设置。
 *
 * 跳过空行与 `#` 注释；`Content-Type` 由客户端管理，写了也忽略（协议不能被改坏）。
 * 同名键以最后一次为准，键名保持用户写法（HTTP 头大小写不敏感）。
 */
export function parseCustomHeaders(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const colon = line.indexOf(":");
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (!name || !value) continue;
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) continue;
    if (name.toLowerCase() === "content-type") continue;
    for (const existing of Object.keys(out)) {
      if (existing.toLowerCase() === name.toLowerCase()) delete out[existing];
    }
    out[name] = value;
  }
  return out;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const target = name.toLowerCase();
  return Object.keys(headers).some((key) => key.toLowerCase() === target);
}

/** 内置 API agent 的配置；端点/模型齐了才算可用。 */
export function aiConfigOf(settings: Settings): AiConfig | null {
  const base = settings.aiApi.baseUrl.trim();
  if (!/^https?:\/\//i.test(base)) return null;
  const endpoint = settings.aiApi.protocol === "ollama" ? ensureOllamaBase(base) : base;
  const model = (settings.aiAgentModels.api ?? "").trim();
  if (!model) return null;
  return {
    endpoint,
    model,
    apiKey: settings.aiApi.apiKey.trim(),
    headers: parseCustomHeaders(settings.aiApi.headers ?? ""),
  };
}

/** 请求头合并：自定义优先，但 Content-Type 由客户端管理。 */
function headersOf(config: AiConfig): Record<string, string> {
  const headers: Record<string, string> = { ...config.headers };
  if (!hasHeader(headers, "content-type")) headers["Content-Type"] = "application/json";
  if (config.apiKey && !hasHeader(headers, "authorization")) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

/** 端点写 base（…/v1）或完整地址都能用。 */
export function completionsUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, "");
  return base.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
}

/** 同一份 base 上的模型列表地址。 */
export function modelsUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, "").replace(/\/chat\/completions$/i, "");
  return `${base}/models`;
}

/** Ollama 的 OpenAI 兼容层挂在 /v1 下：用户只填主机名也能用。 */
export function ensureOllamaBase(baseUrl: string): string {
  const base = baseUrl.trim().replace(/\/+$/, "");
  return /\/v1(\/|$)/i.test(base) ? base : `${base}/v1`;
}

export class AiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "AiError";
  }
}

export interface StreamOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string) => void;
}

/** 流式对话；返回完整文本。取消用 AbortSignal。 */
export async function streamChat(
  config: AiConfig,
  messages: ChatMessage[],
  options: StreamOptions = {},
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(completionsUrl(config.endpoint), {
      method: "POST",
      headers: headersOf(config),
      body: JSON.stringify({ model: config.model, messages, stream: true }),
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new AiError("无法连接到 AI 端点，请检查网络与端点地址");
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new AiError(
      `${describeStatus(response.status)}${detail ? `：${extractMessage(detail) || detail}` : ""}`,
      response.status,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  const reader = response.body?.getReader();
  if (!reader) throw new AiError("端点没有返回内容");

  // 忽略 stream 参数、直接回整段 JSON 的网关
  if (contentType.includes("application/json") && !contentType.includes("event-stream")) {
    const data = JSON.parse(await response.text()) as ChatCompletion;
    const text = data.choices?.[0]?.message?.content ?? "";
    options.onDelta?.(text);
    return text;
  }

  return await readSse(reader, options.onDelta);
}

interface ChatCompletion {
  choices?: Array<{
    message?: { content?: string };
    delta?: { content?: string };
  }>;
}

function describeStatus(status: number): string {
  if (status === 401 || status === 403) return "端点拒绝访问（Key 或权限不对）";
  if (status === 404) return "端点地址不对（没有这个路径）";
  if (status === 429) return "请求太频繁，稍后再试";
  if (status >= 500) return "模型服务出错，稍后再试";
  return `端点返回错误（${status}）`;
}

function extractMessage(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string }; message?: string };
    const text = parsed.error?.message ?? parsed.message;
    return typeof text === "string" ? text.slice(0, 300) : "";
  } catch {
    return "";
  }
}

async function readSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  onDelta?: (delta: string) => void,
): Promise<string> {
  const decoder = new TextDecoder();
  let buffer = "";
  let full = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE 事件之间是空行；网关可能用 \r\n
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    for (const event of events) {
      for (const line of event.split(/\r?\n/)) {
        const text = line.trim();
        if (!text.startsWith("data:")) continue;
        const payload = text.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const parsed = JSON.parse(payload) as ChatCompletion;
          const delta = parsed.choices?.[0]?.delta?.content ?? "";
          if (delta) {
            full += delta;
            onDelta?.(delta);
          }
        } catch {
          // 非 JSON 的 data 行（网关注释、心跳）直接忽略
        }
      }
    }
  }
  return full;
}

/**
 * 非流式对话，支持工具调用（聊天面板用）。
 *
 * 流式 + tool_calls 的 delta 拼接很啰嗦，而聊天改文档本来就是「想清楚再动手」，
 * 一次等 2–5 秒可以接受。工具结果由调用方执行后放进下一轮消息。
 */
export async function completeWithTools(
  config: AiConfig,
  messages: ChatMessage[],
  tools: ChatTool[] | null,
  options: { signal?: AbortSignal } = {},
): Promise<ToolCompletion> {
  let response: Response;
  try {
    response = await fetch(completionsUrl(config.endpoint), {
      method: "POST",
      headers: headersOf(config),
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        ...(tools && tools.length ? { tools, tool_choice: "auto" } : {}),
      }),
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new AiError("无法连接到 AI 端点，请检查网络与端点地址");
  }

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new AiError(
      `${describeStatus(response.status)}${detail ? `：${extractMessage(detail) || detail}` : ""}`,
      response.status,
    );
  }

  const data = (await response.json()) as {
    choices?: Array<{
      message?: { content?: string | null; tool_calls?: ToolCallPayload[] };
    }>;
  };
  const message = data.choices?.[0]?.message;
  return {
    content: message?.content ?? "",
    toolCalls: message?.tool_calls ?? [],
  };
}

/** 拉取模型列表（OpenAI 兼容的 GET /models）。网关不支持时会抛错，UI 提示手填。 */
export async function listModels(config: AiConfig): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(modelsUrl(config.endpoint), { headers: headersOf(config) });
  } catch {
    throw new AiError("无法获取模型列表，请检查网络或手动填写模型名");
  }
  if (!response.ok) {
    throw new AiError(`${describeStatus(response.status)}（模型列表）`, response.status);
  }
  const data = (await response.json()) as {
    data?: Array<{ id?: string }>;
    models?: Array<{ name?: string }>;
  };
  const ids = [
    ...(data.data ?? []).map((entry) => entry.id),
    ...(data.models ?? []).map((entry) => entry.name),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
}

/** 设置页的「测试连接」：发一句最小请求，返回模型回复片段。 */
export async function testConnection(config: AiConfig): Promise<string> {
  const result = await completeWithTools(
    config,
    [{ role: "user", content: "只回复 OK，不要解释。" }],
    null,
  );
  return (result.content || "（模型没有返回文本）").trim().slice(0, 120);
}
