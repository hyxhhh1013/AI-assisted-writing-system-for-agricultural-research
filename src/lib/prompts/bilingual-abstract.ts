import { stripInlineCitations } from "@/lib/abstract-utils";

export function buildBilingualAbstractPrompt(input: {
  title: string;
  projectMode: "review" | "research";
  bodyText: string;
  primaryLanguage: "zh" | "en";
}): string {
  const body = stripInlineCitations(input.bodyText).slice(0, 12000);
  const modeLabel = input.projectMode === "research" ? "研究论文" : "综述";

  return `你是学术期刊摘要写作者。请基于已完成正文，为${modeLabel}撰写**中英双语摘要**。

题目：${input.title}
项目主语言：${input.primaryLanguage === "zh" ? "中文" : "英文"}（主语言摘要应略更完整）

—— 铁律 ——
1. 严格基于正文提炼，禁止编造正文未出现的数据/结论
2. 摘要中禁止任何文献引用标记（[1]、[2,3] 等）
3. 中文、英文各一个完整段落；不分点；不要「摘要：」前缀
4. 中英文信息应对齐（同一研究问题、方法要点、主要发现、结论边界）
5. 研究型：背景→方法→结果→结论；综述型：范围→共识→缺口/展望

【已完成正文】
${body || "（正文不足，请据题目写极短占位并明确标注需补充正文）"}

只输出 JSON 对象，格式：
{"zh":"...","en":"..."}
不要 markdown 围栏。`;
}
