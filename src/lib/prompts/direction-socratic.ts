/**
 * 研究方向战略规划 — Socratic → 预承诺 Scoring Plan
 *
 * 对齐 academic-paper v3.6.6：
 * - Paper-blind：不接触资产，仅 Q&A + 用户 Acceptance Criteria Paraphrase
 * - 输出含维度级 scoring_plan + rubric 明细
 */

import { buildDomainExpertise } from "./domain";
import { ANALYSIS_DIMENSIONS } from "@/lib/direction-pre-commitment";

export interface SocraticTranslationInput {
  directionName: string;
  directionDesc?: string | null;
  qa: Array<{ question: string; answer: string }>;
  /** 用户亲自复述的验收标准（Phase 4a 等价物） */
  paraphrases: Record<string, string>;
}

const DIMENSION_TABLE = ANALYSIS_DIMENSIONS.map(
  (d) => `| ${d.id} | ${d.name} | ${(d.weight * 100).toFixed(0)}% | ${d.coreQuestion} |`,
).join("\n");

/** Q1–Q10 与维度的权威映射（须与 contracts/direction-socratic.ts 一致） */
const QA_DIMENSION_MAP = `
| 问题 | 映射维度 | 用途 |
|------|----------|------|
| Q1 期刊层次 | D7, D5 | 创新/期刊匹配、候选排序 |
| Q2 最少重复 | D4 | 样本量 block/warn 阈值 |
| Q3 统计方法 | D4 | 分析严谨性检查 |
| Q4 论文数量目标 | D5, D6 | 产出规划、实验周期 |
| Q5 核心优势子方向 | D1, D2, D7 | 资产覆盖、问题框架 |
| Q6 擅长方法/表征 | D1, D6, D7 | 实验补全可行性 |
| Q7 实验室优势来源 | D7, D1 | 创新性判断 |
| Q8 退稿原因 | D4, D7, D2 | 风险警惕点 |
| Q9 数据限制 | D4, D6 | 充分性/补实验 |
| Q10 跨方向协同 | D8 | 协同机会 |
`;

export function buildSocraticToRubricPrompt(
  input: SocraticTranslationInput,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const qaText = input.qa
    .map((item, i) => `**Q${i + 1}**: ${item.question}\n**A${i + 1}**: ${item.answer}`)
    .join("\n\n");

  const paraphraseText = ANALYSIS_DIMENSIONS.map(
    (d) => `**${d.id} ${d.name}**（用户复述）:\n${input.paraphrases[d.id] || "（未提供）"}`,
  ).join("\n\n");

  const system = `${domainExpertise}

你是一位科研战略规划顾问，专长于帮助实验室制定 **8 维度评价标准（Evaluation Contract / Scoring Plan）**。

## Iron Rule — Paper-Blind 预承诺

你处于 **预承诺阶段**，**尚未、也不得**看到任何资产数据（实验记录、论文清单、数据集）。
你只能基于：
1. 研究方向名称与描述
2. 用户对 10 个 Socratic 问题的回答
3. 用户亲自撰写的 **Acceptance Criteria Paraphrase**（验收标准复述）

生成的 Rubrics 必须**可追溯**到上述输入；不得臆造用户未表达的标准。

## 8 维度框架

| ID | 维度 | 权重 | 核心问题 |
|----|------|------|----------|
${DIMENSION_TABLE}

## 问答 → 维度映射（权威）

${QA_DIMENSION_MAP}

## 任务

1. 为 **D1–D8 每个维度** 写一段 \`scoring_plan\`（4 字段，对齐 academic-paper Phase 6a）：
   - \`dimension_id\`
   - \`what_to_look_for\`：分析阶段在该维度要找什么证据
   - \`what_triggers_block\`：硬性阻挡（阻断路线图/ready 标记）
   - \`what_triggers_warn\`：软性提醒
2. 每个维度再生成 **2–4 条** 可操作的 \`rubrics\` 明细（含 \`evidence_required\`：引用资产哪些字段）
3. 将用户回答中的**具体数字与偏好**写入 rubrics（如重复 ≥ N 次、目标期刊档次）

## 输出格式

严格 JSON（无 code fence）：

{
  "dimensions": [
    {
      "id": "D4",
      "name": "数据质量与充分性",
      "weight": 0.15,
      "scoring_plan": {
        "dimension_id": "D4",
        "what_to_look_for": "...",
        "what_triggers_block": "...",
        "what_triggers_warn": "..."
      },
      "rubrics": [
        {
          "id": "D4.1",
          "what_to_look_for": "...",
          "what_triggers_block": "...",
          "what_triggers_warn": "...",
          "evidence_required": "experiment.keyFindings / sampleSize"
        }
      ]
    }
  ],
  "rationale": "150字内：哪些问答/复述条目驱动了哪些维度的 block/warn 阈值",
  "source_questions": ["q2", "q8"]
}`;

  const user = `研究方向：${input.directionName}${input.directionDesc ? `\n方向总述：${input.directionDesc}` : ""}

## Socratic 问答（10 题）

${qaText}

## 用户 Acceptance Criteria Paraphrase

${paraphraseText}

请生成完整 8 维度 Scoring Plan + Rubrics。`;

  return { system, user };
}
