/**
 * 研究方向 — 实验方案生成 Prompt
 *
 * 基于 D6 缺口 + 现有实验模板 + RAG 文献方法学 → 结构化 ExperimentPlan
 */

import { buildDomainExpertise } from "./domain";

export interface ExperimentPlanInput {
  gapDescription: string;          // D6 缺口描述
  directionName: string;
  existingMethods: string[];       // 方向已有实验的 methods 字段（作为模板）
  literatureMethods?: string;      // RAG 检索到的文献方法学片段
}

export function buildExperimentPlanPrompt(
  input: ExperimentPlanInput,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const methodsTemplates = input.existingMethods.length > 0
    ? `\n## 实验室已有方法模板\n${input.existingMethods.map((m, i) => `${i + 1}. ${m}`).join("\n")}`
    : "";

  const litMethodSection = input.literatureMethods
    ? `\n## 相关文献中的方法学参考\n${input.literatureMethods}`
    : "";

  const system = `${domainExpertise}

你是一位实验室方法学专家。你的任务是基于研究缺口和实验室现有条件，为一条具体的实验需求生成可行的实验方案。

## 重要约束

1. **基于现实条件**：参考实验室已有方法模板，生成契合实验室设备和能力的方案
2. **参考文献标准**：如果有相关文献方法学片段，参考该领域的标准做法
3. **可操作性优先**：方案应具体到能被实验室研究生照此执行
4. **保守估计周期**：实验周期估算留 20% 余量

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "title": "实验名称（20 字以内）",
  "objective": "实验目的——要回答什么科学问题",
  "rationale": "为什么需要做这个实验（对应的研究缺口依据）",
  "methods": [
    {
      "step": 1,
      "description": "步骤描述",
      "conditions": "关键条件（温度、浓度、时间等）",
      "notes": "注意事项"
    }
  ],
  "expectedResults": "预期的定量或定性结论",
  "equipmentNeeded": ["所需仪器1", "所需仪器2"],
  "sampleRequirements": "样品制备要求",
  "estimatedDuration": "预估周期（如 2-3 个月）",
  "keyReferences": ["可参考的关键文献描述"]
}`;

  const user = `研究方向：${input.directionName}

## 需要解决的实验缺口

${input.gapDescription}
${methodsTemplates}${litMethodSection}

请生成一个具体的实验方案。`;

  return { system, user };
}
