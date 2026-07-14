export function buildArgumentBlueprintPrompt(params: {
  title: string;
  outline: string;
  language: string;
  thesisHint?: string;
  writingBlueprintThesis?: string;
}): { system: string; user: string } {
  const lang = params.language === "en" ? "English" : "中文";
  const system = `你是学术论证架构师。根据论文大纲生成 Argument Blueprint（论证蓝图）。
输出严格 JSON（不要 markdown 围栏）：
{
  "version": 1,
  "thesis": "全文核心论点一句话",
  "logicalFlow": "章节间逻辑如何推进（一段话）",
  "claims": [
    {
      "id": "c1",
      "claim": "可检验的论断",
      "evidence": ["证据要点1", "证据要点2"],
      "sectionPath": "对应大纲章节标题或路径",
      "counterArgument": "可能反方或局限",
      "response": "如何回应反方"
    }
  ],
  "generatedAt": ${Date.now()}
}
要求：
- 使用${lang}
- claims 3–8 条，覆盖大纲主要章节
- evidence 为要点而非虚构 DOI
- 禁止编造文献`;

  const user = [
    `题目：${params.title}`,
    params.thesisHint ? `论点提示：${params.thesisHint}` : "",
    params.writingBlueprintThesis ? `写作蓝图 thesis：${params.writingBlueprintThesis}` : "",
    `大纲：\n${params.outline}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  return { system, user };
}
