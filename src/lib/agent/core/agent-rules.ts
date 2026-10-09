/**
 * Agent 纪律单一事实源（W3-AP-RULES-01）。
 * prompt / nudge / 硬拦文案读这里的 `text`；本文件不是分类器。
 */

import type { IntentKind } from "@/contracts/agent-intent";

export const AGENT_RULE_IDS = [
  "no-argument-blueprint",
  "review-subsection",
  "catalog-then-read",
  "draft-missing-refs",
  "citation-refine-writeback",
  "results-data-foundation",
  "data-human-confirm",
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
      "研究现状 background、综述 literature_body：蓝图有多子节时必须带 subsectionTitle 逐节写，禁止一次写完整章。"
      + "用户说「继续」时立刻写下一未写子节，禁止再 list_references / read_section / 检索。",
    appliesTo: ["review_write", "draft", "ap_full"],
    severity: "nudge",
  },
  {
    id: "catalog-then-read",
    text:
      "先按蓝图主张和已有数据写节，不要写前精读文献库。写完停下来问要不要配引用。"
      + "用户要求配引用时，再按这句话找能支撑的几篇，不要把库重读一遍。"
      + "跟聊「继续」按蓝图下一节写，禁止再摸底检索。",
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
      "研究型写 results 必须先有用户确认过的数据根基：对话框上传 CSV/Excel 后 ingest_project_data，等确认卡勾选通过才算入库；无根基时 write_section 会被拒绝，不要编造实验数值，也不要先写空结果再补数据。",
    appliesTo: ["draft", "ap_full"],
    severity: "nudge",
  },
  {
    id: "data-human-confirm",
    text:
      "实验数据必须先跟用户核对再入库。不要用固定表头去猜文件结构。"
      + "先 read_attachment 看带行号的原文，再用 ingest_project_data 的 tablesJson 写明读法（哪张表、表头行、哪些列、数值含义）。确认卡只展示这份读法，用户勾选后才写入。未勾选的不写入。"
      + "已做好的图会先读出图上能看清的数值，放在确认卡上。用户勾选后这些数写成证据声明，写作可以引用；没出现在确认卡上的数字禁止写进正文。未确认不得 write_section(results)。"
      + "XRD、红外、拉曼叠谱用 plot_peak_stack，按已入库文件名取曲线，不要把整条谱贴进 generate_chart。多格组图（例如 XPS 六格）用 plot_panel_grid。热重、DTG、吸附等温线、孔径分布用 plot_curve_overlay，不要把整条曲线贴进 generate_chart。峰和虚线只标用户说过的位置和名称，没给就不标。禁止自己编化学归属，也不要自动做 XPS 分峰填充。",
    appliesTo: ["draft", "ap_full"],
    severity: "nudge",
  },
  {
    id: "outline-human-confirm",
    text:
      "generate_outline 写回后必须停等用户批准大纲。"
      + "用户批准后才可 generate_writing_blueprint；蓝图写回后必须再停等用户批准，不要接着写正文。"
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
