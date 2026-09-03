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
      "写章节缺文献时照常写：检索 1 次确认没有后，用现有文献替代或泛化表述开写；不要为凑齐引用反复 search。",
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
      "generate_outline 写回后必须停等用户批准，禁止接着 generate_writing_blueprint。"
      + "本会话若有大纲/框架附件，工具会按附件一级标题锁骨架；不要跳过附件另起炉灶。",
    appliesTo: ["draft", "ap_full", "review_write"],
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
