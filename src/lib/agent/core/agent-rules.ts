/**
 * Agent 纪律单一事实源（W3-AP-RULES-01）。
 * prompt / nudge / 硬拦文案读这里的 `text`；本文件不是分类器。
 */

import type { IntentKind } from "@/contracts/agent-intent";

export const AGENT_RULE_IDS = [
  "no-argument-blueprint",
  "review-subsection",
  "draft-missing-refs",
  "citation-refine-writeback",
  "results-data-foundation",
  "outline-human-confirm",
  "one-deliverable-turn",
] as const;

export type AgentRuleId = (typeof AGENT_RULE_IDS)[number];

export type AgentRuleSeverity = "nudge" | "hard";

export interface AgentRule {
  id: AgentRuleId;
  text: string;
  appliesTo: readonly IntentKind[] | "*";
  severity: AgentRuleSeverity;
}

export const AGENT_RULES: readonly AgentRule[] = [
  {
    id: "no-argument-blueprint",
    text:
      "论证已并入写作蓝图各节 claim/evidenceHint；勿再调用 build_argument_blueprint，改用 generate_writing_blueprint。",
    appliesTo: "*",
    severity: "nudge",
  },
  {
    id: "review-subsection",
    text:
      "综述 literature_body：蓝图有多子节时必须带 subsectionTitle 逐节写，禁止一次写完整章。",
    appliesTo: ["review_write", "draft", "ap_full"],
    severity: "nudge",
  },
  {
    id: "draft-missing-refs",
    text:
      "写章节时若检索确认没有可用文献，停下来用 ask_user 说明缺口，请用户补文献或明确允许泛化表述；不要为凑引用反复 search，也不要静默写成空泛正文。",
    appliesTo: ["draft", "ap_full"],
    severity: "nudge",
  },
  {
    id: "citation-refine-writeback",
    text:
      "引用修正必须用 refine_content(..., persistToProject=true) 写回；不要只 read 不写回。",
    appliesTo: ["citation_apply", "citation", "ap_full"],
    severity: "nudge",
  },
  {
    id: "results-data-foundation",
    text:
      "研究型写 results 必须先有数据根基：对话框上传 CSV/Excel（或仪器数据）后 ingest_project_data；无根基时 write_section 会被拒绝，不要编造实验数值，也不要先写空结果再补数据。",
    appliesTo: ["draft", "ap_full"],
    severity: "nudge",
  },
  {
    id: "outline-human-confirm",
    text:
      "generate_outline 写回后必须停等用户批准大纲（这是唯一的结构确认）。"
      + "用户批准后才可 generate_writing_blueprint；蓝图写回后不要再等人确认蓝图，用中文问写哪一节。"
      + "本会话若有大纲/框架附件，工具会按附件一级标题锁骨架；不要跳过附件另起炉灶。",
    appliesTo: ["draft", "ap_full", "review_write"],
    severity: "nudge",
  },
  {
    id: "one-deliverable-turn",
    text:
      "同一轮只交付一个可见结果（一批文献、一份大纲、一份蓝图、一节正文或一张图）。写回后用中文汇报并询问下一步，不要连续写下一节，也不要把文献在同一轮灌到目标篇数。",
    appliesTo: "*",
    severity: "nudge",
  },
];

const RULE_BY_ID = new Map(AGENT_RULES.map((r) => [r.id, r]));

export function ruleText(id: AgentRuleId): string {
  const rule = RULE_BY_ID.get(id);
  if (!rule) {
    throw new Error(`unknown agent rule: ${id}`);
  }
  return rule.text;
}

export function rulesForKind(kind: IntentKind | null | undefined): AgentRule[] {
  if (kind == null) return [...AGENT_RULES];
  return AGENT_RULES.filter(
    (r) => r.appliesTo === "*" || r.appliesTo.includes(kind),
  );
}

export function renderRulesForPrompt(kind?: IntentKind | null): string {
  const rules = rulesForKind(kind);
  if (rules.length === 0) return "";
  return ["## 本轮纪律", ...rules.map((r) => `- ${r.text}`)].join("\n");
}

export function withRule(body: string, id: AgentRuleId): string {
  const text = ruleText(id);
  if (body.includes(text)) return body;
  return `${body}\n【纪律】${text}`;
}
