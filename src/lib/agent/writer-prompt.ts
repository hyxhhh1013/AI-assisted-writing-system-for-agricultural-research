/**
 * WRITE-QA-007：Agent 写节用的短 Writer prompt。
 * 禁令已在 QA code 表（003–006）；这里只给语域骨架 + 证据卡纪律。
 * 专家工具扩写仍走 lib/prompts/writing.ts 的 legacy。
 */

import type { ProjectWritingMode } from "@/contracts/writing-mode";
import type { SectionPromptParams } from "@/lib/prompts/writing-types";

export const SLIM_WRITER_PROFILE = "slim" as const;

const QA_CODES =
  "质检 code（写后自动拦，勿用堆砌「禁止」来猜）："
  + "abstract_has_cite / cite_oob / md_heading / embedded_bib / "
  + "hollow_phrase / throat_clear / results_discussion_bleed / "
  + "overclaim / number_not_in_claims / evidence_unbound / "
  + "intro_gap_missing / review_as_experiment";

const SLIM_SECTION_ZH: Record<string, string> = {
  abstract:
    "写一段摘要：背景→缺口→方法→关键结果（须与正文一致）→结论。不要 [n]，不要分点，不要「摘要：」前缀。",
  introduction:
    "按五步写引言：重要性→已知→缺口（尚不清楚/证据不足/结果不一致）→本文目标→价值。不要预演结果，不要「从未有人研究」。",
  methods:
    "写到可复现：设计、材料来源、关键参数、测定、统计（软件+检验）。不要「常规方法/标准条件」。",
  results:
    "只报告观察到什么：过去时、量化、点图表。不要「可能反映/或许由于」。数字必须来自数据声明。",
  discussion:
    "重申发现→机制（推测句）→与文献对比→至少一条实质局限→证据范围内的意义。",
  conclusion:
    "回到目标→3–5 条核心发现→贡献边界。不引入新数据。不要「首次/证明/填补空白」。",
  literature_body:
    "按本子节主张综合文献：转述+ [n]，对比条件差异。不要写成「本研究」试验报告。",
  background:
    "交代领域背景与关键概念，为后文综述铺垫。有出处的判断须带 [n]。",
};

const SLIM_SECTION_EN: Record<string, string> = {
  abstract:
    "One-paragraph abstract: context → gap → methods → key results (must match the body) → conclusion. No [n], no bullets.",
  introduction:
    "Importance → what is known → gap → this paper's aim → value. Do not preview results.",
  methods:
    "Reproducible methods: design, materials, parameters, assays, statistics.",
  results:
    "Report observations only, past tense, with numbers from data claims. No causal speculation.",
  discussion:
    "Main finding → mechanism → literature contrast → one real limitation → implication within evidence.",
  conclusion:
    "Restate aim → 3–5 findings → boundary. No new data. No 'first/prove/fill the gap'.",
  literature_body:
    "Synthesize sources for this subsection; paraphrase + [n]. Do not write as if this is your experiment.",
  background:
    "Set domain context. Cite [n] for borrowed claims.",
};

export function resolveSlimSectionPrompt(
  section: string,
  mode: ProjectWritingMode | undefined,
  opts: SectionPromptParams,
): string {
  const table = opts.isChinese ? SLIM_SECTION_ZH : SLIM_SECTION_EN;
  const key = section === "literature_body" || mode !== "research"
    ? (table[section] ? section : "literature_body")
    : section;
  return table[key] ?? (opts.isChinese ? "按本节主张扩写，覆盖要点。" : "Expand this section's claims.");
}

export interface SlimWriterSystemPromptParams {
  section: string;
  domainExpertise: string;
  globalReferenceInfo: string;
  language: string;
  contextText: string;
  sectionInstruction: string;
  evidenceSummary?: string;
  projectMode?: ProjectWritingMode;
}

/** 短系统提示：文献池 + 证据卡 + 语域，不写 FIGURE JSON / 书目格式 / 空话长禁令。 */
export function buildSlimWriterSystemPrompt(params: SlimWriterSystemPromptParams): string {
  const isChinese = params.language !== "en";
  const isAbstract = params.section === "abstract";
  const global = clipGlobal(params.globalReferenceInfo, 900);
  const pool = isAbstract ? "" : `\n—— 可供引用的文献 ——\n${params.contextText}\n`;
  const data = params.evidenceSummary
    ? `\n—— 数据声明（定量结论只许用这里的数） ——\n${params.evidenceSummary}\n`
    : "";

  if (isChinese) {
    return `${params.domainExpertise}
撰写「${params.section}」。只输出正文。
${global}
${pool}${data}
${params.sectionInstruction}

—— 证据卡 ——
若上下文有【证据绑定】：按 C1/C2… 扩写；只引用表中 [n]；soft 只概括，禁止编造该文献精确数据；未绑定的主张不要硬挂 [n]。
没有绑定表时：没有依据的观点直接陈述，不要虚构 [n]。
文中引用只用半角 [n] / [n,m]。不要输出参考文献列表。
不要使用 Markdown # 标题；子节用「2.1 …」纯文本。
不要插入【FIGURE】JSON 或插图占位（配图走 generate_chart）。
不要写元文字、编辑批注、道歉。

${QA_CODES}
`;
  }

  return `${params.domainExpertise}
Write the "${params.section}" section. Output body text only.
${global}
${pool}${data}
${params.sectionInstruction}

—— Evidence cards ——
If the context has an evidence-bind table: cover C1/C2…; cite only listed [n]; soft = paraphrase only.
In-text cites: half-width [n] only. No bibliography. No Markdown # headings. No 【FIGURE】 JSON.

${QA_CODES}
`;
}

function clipGlobal(text: string, max: number): string {
  const t = (text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n…（全局背景已截断，以本节证据绑定为准）`;
}
