/**
 * 写作任务单。
 *
 * 「精细化」不是形容词，是可以填写的约束：写给谁、多长、必须覆盖什么、不许写什么。
 * 任务单是分节初稿与审稿的输入，也是事后复盘的依据（存本机，随文档走不合适）。
 */

export type BriefProfile = "proposal" | "report" | "novel" | "general";
export type BriefTone = "formal" | "plain" | "narrative";

export interface WritingBrief {
  profile: BriefProfile;
  topic: string;
  audience: string;
  length: string;
  tone: BriefTone;
  mustInclude: string;
  avoid: string;
}

const KEY = "writara:brief";

export const EMPTY_BRIEF: WritingBrief = {
  profile: "proposal",
  topic: "",
  audience: "",
  length: "",
  tone: "formal",
  mustInclude: "",
  avoid: "",
};

const PROFILES: BriefProfile[] = ["proposal", "report", "novel", "general"];
const TONES: BriefTone[] = ["formal", "plain", "narrative"];

export const PROFILE_LABELS: Record<BriefProfile, string> = {
  proposal: "技术方案",
  report: "报告 / 总结",
  novel: "小说 / 叙事",
  general: "通用",
};

export const TONE_LABELS: Record<BriefTone, string> = {
  formal: "正式",
  plain: "平实",
  narrative: "叙事",
};

/** 档位的结构偏好：只约束「先写什么、按什么顺序」，不限定具体标题。 */
export const PROFILE_GUIDES: Record<BriefProfile, string> = {
  proposal: "结构偏「现状 → 目标 → 方案 → 步骤与周期 → 风险 → 成本」；先结论后论证，取舍要写理由。",
  report: "结构偏「背景 → 结论 → 依据 → 下一步」；数据与事实优先，少讲过程。",
  novel: "按章节推进；场景具体、对白自然；不要章节总结，不要跳出视角解释。",
  general: "按内容自然分节，避免套话式开头与总结式结尾。",
};

/** 切换档位时的默认语气（只改语气，不覆盖用户已填字段）。 */
export function toneForProfile(profile: BriefProfile): BriefTone {
  if (profile === "novel") return "narrative";
  if (profile === "general") return "plain";
  return "formal";
}

function text(value: unknown, limit: number): string {
  return typeof value === "string" ? value.slice(0, limit) : "";
}

export function normalizeBrief(raw: unknown): WritingBrief {
  const input = (raw ?? {}) as Partial<WritingBrief>;
  return {
    profile: PROFILES.includes(input.profile as BriefProfile)
      ? (input.profile as BriefProfile)
      : EMPTY_BRIEF.profile,
    topic: text(input.topic, 500),
    audience: text(input.audience, 200),
    length: text(input.length, 100),
    tone: TONES.includes(input.tone as BriefTone) ? (input.tone as BriefTone) : EMPTY_BRIEF.tone,
    mustInclude: text(input.mustInclude, 2000),
    avoid: text(input.avoid, 2000),
  };
}

export function loadBrief(): WritingBrief {
  if (typeof localStorage === "undefined") return { ...EMPTY_BRIEF };
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeBrief(JSON.parse(raw)) : { ...EMPTY_BRIEF };
  } catch {
    return { ...EMPTY_BRIEF };
  }
}

export function saveBrief(brief: WritingBrief): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(KEY, JSON.stringify(brief));
  } catch {
    // 存不下就算了：任务单只在本次会话里用也不影响生成
  }
}

/** 任务单 → 给模型的自然语言约束。 */
export function briefToPrompt(brief: WritingBrief): string {
  const lines: string[] = [];
  if (brief.topic.trim()) lines.push(`主题：${brief.topic.trim()}`);
  if (brief.audience.trim()) lines.push(`目标读者：${brief.audience.trim()}`);
  if (brief.length.trim()) lines.push(`篇幅：${brief.length.trim()}`);
  lines.push(`文体与语气：${TONE_LABELS[brief.tone]}（${PROFILE_LABELS[brief.profile]}）`);
  lines.push(`结构偏好：${PROFILE_GUIDES[brief.profile]}`);
  if (brief.mustInclude.trim()) lines.push(`必须覆盖：\n${brief.mustInclude.trim()}`);
  if (brief.avoid.trim()) lines.push(`明确避免：\n${brief.avoid.trim()}`);
  return lines.join("\n");
}
