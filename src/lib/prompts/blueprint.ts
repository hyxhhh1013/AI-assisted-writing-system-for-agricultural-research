import { buildDomainExpertise } from "./domain";
import type { ProjectWritingMode } from "@/contracts/writing-mode";

export function buildBlueprintPrompt(params: {
  title: string;
  researchDirection: string;
  outline: string;
  language: string;
  projectMode?: ProjectWritingMode;
}): string {
  const { title, researchDirection, outline, language, projectMode } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);
  const isResearch = projectMode === "research";
  const lang = language === "en" ? "English" : "Chinese";

  const figureRules = isResearch
    ? `- 原创研究论文：流程图集中在「材料与方法」；数据图/XRD 集中在「结果与分析」；引言与结论通常 0–1 张示意即可。
- 禁止为尚无试验数据的节规划「本研究实测数据图」，可标 optional 占位。`
    : `- 文献综述：配图以概念框架图、对比表、趋势综合图为主；禁止安排「本试验数据图」「材料与方法流程（原创实验）」。
- 各主题综述子节可规划 0–1 张综合示意或对比图。`;

  return `${domainExpertise}
你是一名农业科研论文写作顾问。用户已确认论文大纲，请基于大纲生成「写作蓝图」，帮助作者在扩写前把握全文结构与配图规划。

【论文类型】${isResearch ? "原创研究（IMRaD）" : "文献综述"}

【任务】
1. 用 2–3 句话概括全文叙事逻辑（narrativeSummary）和一句核心论点（thesis）。
2. 估计全文字数区间（estimatedWordCount，中文论文通常 6000–12000）。
3. 规划配图：先估总量（totalMin/totalMax），再分配到具体大纲节点（sectionPath 必须与大纲中的「完整路径」一致，用 " > " 连接层级，如 "结果与分析 > 产量变化"）。
4. 为重要章节写 sectionGuides（purpose + keyPoints）。
5. 给出建议写作顺序 writingOrder（sectionPath 数组）。
6. 列出 prerequisites（如需先备实验数据、先画流程图等）。

【配图规则】
${figureRules}
- type 只能是：flow | chart | xrd | table | schematic | other
- priority：required（强烈建议）或 optional
- 每项配图须有清晰 purpose 与 suggestedCaption（图题草案）

【输出要求】
- 仅输出一个 JSON 对象，不要 markdown 代码块，不要其他文字。
- 输出语言字段内容用 ${lang}。
- figurePlan.items 至少 ${isResearch ? 3 : 2} 项，sectionGuides 至少 3 项。

【JSON 结构】
{
  "version": 1,
  "narrativeSummary": "...",
  "thesis": "...",
  "estimatedWordCount": { "min": 8000, "max": 10000 },
  "figurePlan": {
    "totalMin": 5,
    "totalMax": 7,
    "items": [
      {
        "id": "fig-1",
        "sectionPath": "材料与方法 > 试验设计",
        "type": "flow",
        "purpose": "展示试验流程",
        "suggestedCaption": "图1 试验流程示意图",
        "priority": "required",
        "dataSource": "experiment"
      }
    ]
  },
  "sectionGuides": [
    {
      "sectionPath": "引言",
      "purpose": "...",
      "keyPoints": ["...", "..."],
      "estimatedParagraphs": 4
    }
  ],
  "writingOrder": ["材料与方法", "结果与分析", "引言", "结论"],
  "prerequisites": ["..."],
  "generatedAt": 0
}

【论文题目】${title}
【研究方向】${researchDirection}

【已确认大纲】
${outline}`;
}
