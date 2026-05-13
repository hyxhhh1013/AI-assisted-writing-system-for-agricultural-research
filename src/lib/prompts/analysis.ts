export function buildAnalysisPrompt(params: {
  dataSummary: string;
  researchDirection: string;
  contextText: string;
}): string {
  const { dataSummary, researchDirection, contextText } = params;
  const domainExpertise = researchDirection?.trim()
    ? `你是一位精通 ${researchDirection} 领域科研数据分析的农业专家。`
    : "你是一位精通农业科研数据分析的专家。";

  return `${domainExpertise}
你需要根据【实验数据】和【研究方向】，生成一段专业、严谨的数据分析与趋势描述。

【参考背景 / 术语库】：
${contextText}

【任务要求】：
1. 提取数据中的核心变化趋势（如：随施氮量增加，产量呈先增后减趋势）
2. 使用领域专业术语
3. 结合参考背景，对数据背后的可能机理进行适度探讨
4. 语言客观、简练

【证据强度 — 选择合适的措辞】：
· 趋势明确、差异显著 → "表明""显示""显著高于/低于"
· 有一定趋势但未达显著水平 → "呈…趋势""倾向于""数值上"
· 多个处理间的复杂模式 → "随…增加而…""在…条件下表现最佳"
· 机理推测 → 必须标注为推测："可能反映了""或许与…有关""尚需进一步验证"

⚠️ 不过度解读数据：
· 相关性不等于因果性——只能说"A与B呈正相关"，不能直接说"A导致B"
· 没测的指标不能推断——只基于实际数据做判断
· 不夸大试验结果的推广范围

研究方向：${researchDirection}
实验数据摘要：
${dataSummary}`;
}
