import type { ChatMessage } from "./client";

/**
 * AI 动作与提示词。
 *
 * 一个动作一个 id + 一段用户指令；系统提示词统一约束「输出是Markdown 正文、
 * 没有 AI 腔」——这是反 AI 腔的第二层：规则层兜底，生成时就少犯。
 */

export type AiActionId =
  | "polish"
  | "expand"
  | "shorten"
  | "deslop"
  | "continue"
  | "draft"
  | "proofread"
  | "review"
  | "table"
  | "chart"
  | "formula";

export interface AiActionMeta {
  id: AiActionId;
  label: string;
  /** 动作的对象：选区（无选区取当前段）/ 光标位置 / 全文 / 初稿（需要用户输入）。 */
  scope: "selection" | "cursor" | "doc" | "draft";
  /** 结果进文档（显示「替换 / 放弃」），否则是只读报告。 */
  replaces: boolean;
}

export const AI_ACTIONS: Record<AiActionId, AiActionMeta> = {
  polish: { id: "polish", label: "润色", scope: "selection", replaces: true },
  expand: { id: "expand", label: "扩写", scope: "selection", replaces: true },
  shorten: { id: "shorten", label: "缩写", scope: "selection", replaces: true },
  deslop: { id: "deslop", label: "去 AI 腔", scope: "selection", replaces: true },
  continue: { id: "continue", label: "续写", scope: "cursor", replaces: false },
  draft: { id: "draft", label: "AI 初稿", scope: "draft", replaces: true },
  proofread: { id: "proofread", label: "全文校对", scope: "doc", replaces: true },
  review: { id: "review", label: "审稿意见", scope: "doc", replaces: false },
  table: { id: "table", label: "生成表格", scope: "selection", replaces: true },
  chart: { id: "chart", label: "生成图表", scope: "selection", replaces: true },
  formula: { id: "formula", label: "生成公式", scope: "selection", replaces: true },
};

export const AI_ACTION_IDS: AiActionId[] = [
  "polish",
  "expand",
  "shorten",
  "deslop",
  "continue",
  "table",
  "chart",
  "formula",
];

const SYSTEM = `你是 Markdown 编辑器 Writara 内置的中文写作助手。硬规则：
1. 只输出 Markdown 正文；不要解释、不要前言后语、不要致敬问候。
2. 不要用代码围栏包住输出——除非那本来就是代码块的内容。
3. 忠于原稿：标题层级、列表、表格、公式（$…$ 与 $$…$$）、Mermaid、链接与图片记号原样保留；不改语种。
4. 不用 emoji；不写「总之 / 综上所述 / 值得注意的是」这类过场话；结尾不打圆场、不喊口号。
5. 专有名词、数字、代码、命令一字不改。`;

const TEXT_WRAPS = {
  polish: "按原意润色下面的文字：句子更利落、搭配更自然，删冗余，不改结构与内容取舍。",
  expand:
    "扩写下面的文字：提早把意思展开成两倍上下，用具体细节和例子支撑，每一句都要有信息量，不能注水凑长度。",
  shorten: "压缩下面的文字：保住全部论点与关键数字，砍掉重复与铺垫，长度减到三分之一左右。",
  deslop:
    "重写下面的文字，去掉机器腔：删过场话与空洞总结、删 emoji、收掉无意义的加粗、结尾不打圆场；保持事实与结构不变，说人话。",
  table:
    "把下面的内容整理成一张 Markdown 表格：行列由内容自定，信息一条不丢，表头简短；有数字就入列；输出只有这张表格。",
  chart:
    "用 Mermaid 把下面的内容画成图，flowchart 或 sequenceDiagram 或按内容选型；输出只有一个 ```mermaid 代码块（含开栏围栏），代码里不要注释。",
  formula:
    "把下面的文字写成 LaTeX 公式：一条或多条块级公式（$$…$$），变量含义用 \\text{} 就地说明；需要多行时用 aligned 环境对齐等号。输出只有公式块，不要解释，也不要 Markdown 列表。",
  continue:
    "接着下面的文段继续写 2～4 句：延续语气与话题，不重复已有内容，不另起章节，不写总结。",
  draft:
    "根据用户给出的提纲或需求写出 Markdown 初稿：段落分明、可含二级标题与列表，没有空话；不要开场白与致谢。",
  proofread:
    "通读全文做校对，只做三类修正：错别字；中文标点（一律全角，段落内的半角逗号句号改全角）；同一概念的多种写法统一。不改写句子、不调整结构。输出修改后的全文。",
  review:
    "以编辑部老编辑的口吻给出审读意见，不改动原文。按「结构 / 论证 / 冗长 / 一致性」四节，每节列具体问题：引用原文片段定位，每条一句话说明怎么改。最后一段给总体判断（一句话）。",
};

export interface AiPromptInput {
  action: AiActionId;
  /** 动作对象（选区 / 光标前文 / 全文）。draft 时可为空。 */
  text: string;
  /** 初稿提纲或用户的额外要求。 */
  prompt?: string;
  /** 文样抽样（文风参考、上下文章节），允許为空。 */
  sample?: string;
  /** 项目写作规范（WRITARA.md）原文；会拼进 system。 */
  project?: string;
}

export function buildMessages(input: AiPromptInput): ChatMessage[] {
  const user = userMessage(input);
  const system = input.project?.trim()
    ? `${SYSTEM}\n\n【项目写作规范（WRITARA.md，必须遵守）】\n${input.project.trim()}`
    : SYSTEM;
  const messages: ChatMessage[] = [{ role: "system", content: system }];
  if (input.action === "review" || input.action === "continue") {
    // 审稿意见轮次中允许提及上下文，模型可以拿整篇文档做参照
    if (input.sample) {
      messages.push({
        role: "user",
        content: `【全文参考（不要复述、不要修改）】\n${input.sample}\n`,
      });
    }
  }
  messages.push({ role: "user", content: user });
  return messages;
}

function userMessage(input: AiPromptInput): string {
  const instruction = TEXT_WRAPS[input.action];
  const textPart = input.text.trim()
    ? `【内容】\n${input.text.trim()}\n`
    : "";
  const promptPart = input.prompt?.trim() ? `【要求】\n${input.prompt.trim()}\n` : "";
  const samplePart =
    input.sample && input.action !== "review" && input.action !== "continue"
      ? `【文样参考（只借语气，不要复述）】\n${input.sample}\n`
      : "";
  const scope =
    input.action === "continue"
      ? "光标之前的内容见下。"
      : input.action === "draft"
        ? ""
        : "待处理内容见下。";
  return [instruction, scope, promptPart, samplePart, textPart].filter(Boolean).join("\n");
}

/** 从全文抓一个文样：先头的标题 + 首段，给模型找回语气用。 */
export function styleSample(doc: string, limit = 1200): string {
  const text = doc.trim();
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n……`;
}

/** 光标前的上下文（续写用）。 */
export function beforeCursor(doc: string, pos: number, limit = 1500): string {
  const start = Math.max(0, pos - limit);
  const text = doc.slice(start, pos);
  return text;
}

/** 供 agent 任务使用：把动作转换成给 CLI 的指令文本。 */
export function taskForAction(action: AiActionId): string {
  return TEXT_WRAPS[action];
}
