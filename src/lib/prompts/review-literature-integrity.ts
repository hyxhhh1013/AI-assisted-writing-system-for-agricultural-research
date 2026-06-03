/**
 * 文献综述 — 学术诚信审查 Prompt
 *
 * 侧重：照搬、数据归属、未标注来源的数据、虚假原创表述
 */

import { buildDomainExpertise } from "./domain";

export function buildLiteratureReviewIntegrityPrompt(
  content: string,
  references?: string[],
  target?: string,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();
  const referencesClause = references
    ? `\n\n参考文献列表：\n${references.map((ref, i) => `[${i + 1}] ${ref}`).join("\n")}`
    : "";
  const targetClause = target
    ? `\n\n目标投稿：${target}。请根据该期刊/会议的综述写作规范审查。`
    : "";

  const system = `${domainExpertise}

你是一位文献综述学术诚信审查专家。本文是**文献综述**（非原创试验论文），审查重点与试验论文不同。

## 重要原则

- 只标记可疑问题，不做司法定性
- 照搬他人原文、数据归属错误属于高风险问题
- 宁可漏报，不可误报

## 审查维度（综述专用）

1. **verbatim_copy（疑似照搬）**：正文是否与常见文献表述连续重复 ≥15 汉字
   - 未改写的长句照搬
   - 建议：转述改写并保留 [n]

2. **data_misattribution（数据归属错误）**：他人试验数据被写成「本研究/本试验/我们测得」
   - 综述不得声称做了原创试验

3. **uncited_data（未标注来源的数据）**：出现具体数值、百分比、P 值、样本量但无 [n]

4. **fake_citation（引用真实性）**：引用编号与论述明显不符、疑似虚构

5. **synthesis_gap（综合不足）**：仅罗列「A 做了… B 做了…」，缺乏对比与综合

## 不要重点审查（综述通常不适用）

- 试验可复现性（reproducibility）
- 本文统计方法滥用（stats_misuse）——除非综述错误转述了他人统计结论

## 输出格式

\`\`\`json
{
  "issues": [
    {
      "id": "integrity_1",
      "type": "verbatim_copy|data_misattribution|uncited_data|fake_citation|synthesis_gap",
      "severity": "high|medium|low",
      "location": "第X节/第X段",
      "evidence": "引用原文具体位置",
      "description": "问题描述",
      "suggestion": "改写/归因建议",
      "originalText": "原文片段"
    }
  ]
}
\`\`\`

- 无问题 → "issues": []
- 只输出 JSON${referencesClause}${targetClause}`;

  const user = `请审查以下**文献综述**内容的学术诚信与引用规范：

${content}

请严格按照 JSON 格式输出。`;

  return { system, user };
}
