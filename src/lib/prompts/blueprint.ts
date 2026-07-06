import { buildDomainExpertise } from "./domain";
import type { ProjectWritingMode } from "@/contracts/writing-mode";
import type { BlueprintChartCatalogEntry } from "@/lib/blueprint-utils";

export function buildBlueprintPrompt(params: {
  title: string;
  researchDirection: string;
  outline: string;
  language: string;
  projectMode?: ProjectWritingMode;
  chartCatalog?: BlueprintChartCatalogEntry[];
  /** 从 Direction 分析带入：为什么写这篇论文 */
  motivationFromGap?: string;
  /** 建议投稿的目标期刊 */
  targetJournal?: string;
  /** 写作时需标注"此处需补实验数据"的缺口 */
  pendingExperiments?: string[];
}): string {
  const { title, researchDirection, outline, language, projectMode, chartCatalog, motivationFromGap, targetJournal, pendingExperiments } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);
  const isResearch = projectMode === "research";
  const lang = language === "en" ? "English" : "Chinese";

  // Direction 战略上下文（仅当有值时才注入）
  const directionContext = [
    motivationFromGap ? `- 写作动机：${motivationFromGap}` : "",
    targetJournal ? `- 目标期刊：${targetJournal}（请据此调整蓝图的深度与配图标准）` : "",
    pendingExperiments && pendingExperiments.length > 0
      ? `- 待补实验：${pendingExperiments.join("、")}（在蓝图中标注这些缺口，提醒作者补充数据后再写对应章节）`
      : "",
  ].filter(Boolean).join("\n");

  const figureRules = isResearch
    ? `- 原创研究论文：流程图集中在「材料与方法」；数据图/XRD 集中在「结果与分析」；引言与结论通常 0–1 张示意即可。
- 禁止为尚无试验数据的节规划「本研究实测数据图」，可标 optional 占位。`
    : `- 文献综述：配图以概念框架图、对比表、趋势综合图为主；禁止安排「本试验数据图」「材料与方法流程（原创实验）」。
- 各主题综述子节可规划 0–1 张综合示意或对比图。`;

  return `${domainExpertise}
你是一名农业科研论文写作顾问。用户已确认论文大纲，请基于大纲生成「写作蓝图」，帮助作者在扩写前把握全文结构与配图规划。

【论文类型】${isResearch ? "原创研究（IMRaD）" : "文献综述"}${directionContext ? `\n\n【方向战略上下文】\n${directionContext}` : ""}

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
${chartCatalog && chartCatalog.length > 0 ? `
【项目已有试验数据图表】
以下为已上传/分析得到的推荐图表（chartConfigIndex 从 0 起，与下表 index 一致）。
type=chart 且 dataSource=experiment 的配图项，必须填写 dataBinding，指向最匹配的一行：
${chartCatalog.map((c) => `- [${c.index}] ${c.title}${c.variable ? `（${c.variable}）` : ""} ← ${c.sourceFileName}`).join("\n")}
- dataBinding 格式：{ "kind": "chartConfig", "chartConfigIndex": 0, "sourceFileName": "...", "variable": "...", "chartTitle": "..." }
- 无合适数据时勿虚构 binding，可标 optional 并在 purpose 说明需补数据` : ""}

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
      },
      {
        "id": "fig-2",
        "sectionPath": "结果与分析 > 产量",
        "type": "chart",
        "purpose": "各处理产量对比",
        "suggestedCaption": "图2 各处理产量对比",
        "priority": "required",
        "dataSource": "experiment",
        "dataBinding": {
          "kind": "chartConfig",
          "chartConfigIndex": 0,
          "sourceFileName": "试验数据.xlsx",
          "variable": "产量",
          "chartTitle": "各处理产量对比"
        }
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
