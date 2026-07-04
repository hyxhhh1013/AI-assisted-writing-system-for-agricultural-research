/**
 * 研究方向战略规划 — Socratic Mentor Prompt
 *
 * 将用户的自然语言回答翻译为 8 维度 Rubrics
 */

import { buildDomainExpertise } from "./domain";

export interface SocraticTranslationInput {
  directionName: string;
  directionDesc?: string | null;
  qa: Array<{ question: string; answer: string }>;
}

/**
 * 将 Socratic Q&A 翻译为 8 维度 Rubrics
 * 这个 prompt 不接触资产数据，仅基于用户的自然语言回答
 */
export function buildSocraticToRubricPrompt(
  input: SocraticTranslationInput,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const qaText = input.qa
    .map((item, i) => `**Q${i + 1}**: ${item.question}\n**A${i + 1}**: ${item.answer}`)
    .join("\n\n");

  const system = `${domainExpertise}

你是一位科研战略规划顾问，专长于帮助实验室制定论文评价标准。

## 重要约束

你现在处于「预承诺」阶段——你还没有看到任何资产数据（实验记录、论文清单、数据集）。
你只能基于：
1. 研究方向名称和描述
2. 用户对 6 个问题的回答

## 8 维度框架

| ID | 维度 | 权重 | 核心问题 |
|----|------|------|----------|
| D1 | 已有基础盘点 | 15% | 实验/论文按子方向分布如何？ |
| D2 | 研究问题框架 | 15% | 以研究问题为线索串联资产 |
| D3 | 研究缺口识别 | 15% | 文献有但实验室没做的？做了没写的？ |
| D4 | 数据质量与充分性 | 15% | 每项实验数据能支撑多少结论？ |
| D5 | 论文机会排序 | 15% | 已有数据能写哪些论文？优先级？ |
| D6 | 实验补全路线 | 10% | 高优论文需补什么实验？ |
| D7 | 创新性与竞争分析 | 10% | 在领域中的独特优势？是否太卷？ |
| D8 | 跨方向协同机会 | 5% | 其他方向的方法/数据能否复用？ |

## 任务

根据用户的回答，为每个维度生成 3-5 条具体的 rubric 检查项。

## 每个 Rubric 的字段

1. **id**: 格式 "D{n}.{m}"（如 "D4.1"）
2. **what_to_look_for**: 具体可验证的检查点，融入用户回答中的具体标准
   - 用户说"最少重复 3 次" → 检查项应包含"样本量 ≥ 3"
   - 用户说"投 Q1-Q2" → 检查项应考虑期刊档次对应的数据要求
3. **what_triggers_block**: 硬性阻挡条件（阻断路线图推进）
4. **what_triggers_warn**: 软性提醒条件
5. **evidence_required**: 检查时需要引用什么资产字段

## 用户回答与维度的映射

- **Q1（期刊层次）** → D7（创新性标准与期刊档次匹配）、D5（候选期刊建议）
- **Q2（最少重复次数）** → D4（样本量阈值）
- **Q3（论文数量目标）** → D5（候选数量范围）、D6（实验周期约束）
- **Q4（核心优势子方向）** → D1（资产覆盖率）、D2（研究问题框架）
- **Q5（实验室优势）** → D7（创新性判断标准）
- **Q6（退稿原因）** → D4（数据质量警惕点）、D7（创新性警惕点）、D2（方法学警惕点）

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "dimensions": [
    {
      "id": "D4",
      "name": "数据质量与充分性",
      "weight": 0.15,
      "rubrics": [
        {
          "id": "D4.1",
          "what_to_look_for": "每项实验的独立重复次数是否 ≥ 3（用户标准）",
          "what_triggers_block": "关键实验样本量 < 3，无法进行统计分析",
          "what_triggers_warn": "效应量未同时报告置信区间",
          "evidence_required": "引用资产的 sampleSize 字段或 keyFindings 中的统计量"
        }
      ]
    }
  ],
  "rationale": "生成这个 Rubric 草案的简要理由——基于用户的哪些回答做出了什么推断（150字以内）"
}`;

  const user = `研究方向：${input.directionName}${input.directionDesc ? `\n方向总述：${input.directionDesc}` : ""}

## 用户的回答

${qaText}

请基于以上信息为每个维度生成 3-5 条 rubric 检查项。`;

  return { system, user };
}
