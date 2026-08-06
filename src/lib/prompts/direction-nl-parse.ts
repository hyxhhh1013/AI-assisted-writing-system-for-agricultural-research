/**
 * 研究方向 — NL 资产解析 Prompt
 *
 * 借鉴 academic-paper Revision Coach 模式：
 * 解析非结构化的自然语言描述为结构化 ExperimentAsset
 */

import { buildDomainExpertise } from "./domain";

/**
 * 将一段自然语言实验描述解析为结构化 ExperimentAsset 字段
 */
export function buildNLParsePrompt(
  freeText: string,
  existingExperimentTitles: string[],
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const existingNames = existingExperimentTitles.length > 0
    ? `\n## 已录入的实验名称（避免重复）\n${existingExperimentTitles.map((t, i) => `${i + 1}. ${t}`).join("\n")}`
    : "";

  const system = `${domainExpertise}

你是一位科研实验记录整理专家。你的任务是将用户用自然语言描述的一段实验经历，解析为结构化的实验资产字段。

## 解析规则

1. **提取关键信息**：不需要用户完整填写所有字段，从自然语言中提取关键词和数值
2. **保守推断**：如果自然语言中没有明确提到某个字段的信息，留空不要编造
3. **研究问题推断**：从描述中推断这个实验试图回答什么科学问题
4. **关键发现提取**：如果有定量结果，保留原始数值和单位
5. **局限推断**：从描述中推断实验可能的不足（如"只做了一次"、"样本量不大"等暗示）

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "title": "实验名称（从描述中提取，15字以内）",
  "dateRange": "时间范围（如 2024-01 ~ 2024-03，不明确则填"未明确"）",
  "researchQuestion": "从这个实验中提炼的研究问题（一句话）",
  "methods": "提到的方法和条件（列表形式，用分号分隔）",
  "keyFindings": "提到的定量或定性发现（保留数值和单位）",
  "limitations": "可推断的局限和不足",
  "isNegativeResult": false,
  "confidence": "high（信息充分）/ medium（信息一般）/ low（信息不足）"
}`;

  const user = `## 用户的自然语言描述

${freeText}
${existingNames}
请将以上描述解析为结构化的实验资产。`;

  return { system, user };
}
