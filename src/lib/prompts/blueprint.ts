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
  const langLabel = language === "en" ? "English" : "Chinese";
  /** schema 只接受 zh | en；勿把 Chinese/English 写进 JSON 示例（曾导致「结构无效」） */
  const langCode = language === "en" ? "en" : "zh";

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
1. 用 2–3 句话概括全文叙事逻辑（narrativeSummary）和一句核心论点（thesis）；可选 researchQuestion。
2. 估计全文字数区间（estimatedWordCount，中文论文通常 6000–12000）。
3. 规划配图：先估总量（totalMin/totalMax），再分配到具体大纲节点（sectionPath 必须与大纲中的「完整路径」一致，用 " > " 连接层级，如 "结果与分析 > 产量变化"）。
4. 为重要章节写 sectionGuides：purpose + keyPoints，并尽量填写论证字段 claim / evidenceHint / warrant（必要时 rebuttal）。
5. 给出建议写作顺序 writingOrder（sectionPath 数组）。
6. 列出 prerequisites（如需先备实验数据、先画流程图等）；可选 argumentGaps（证据缺口）。
7. 论证不再单独成文件：主张—证据—推理写进各节 sectionGuides，全文缺口进 argumentGaps。

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
- 叙述字段（narrativeSummary / thesis / purpose 等）用 ${langLabel} 撰写。
- JSON 字段 language 必须是 "${langCode}"（只能是 zh 或 en，禁止 Chinese/English/中文/英文）。
- projectMode 必须是 "${isResearch ? "research" : "review"}"（禁止写中文）。
- dataSource 只能是 experiment | literature | synthesis；type 只能是 flow|chart|xrd|table|schematic|other。
- keyPoints 必须是字符串数组（不要写成单个字符串）。
- figurePlan.items 至少 ${isResearch ? 3 : 2} 项，sectionGuides 至少 3 项；每项须含 id/sectionPath/purpose/suggestedCaption/priority。
- estimatedWordCount 必须是对象 { "min": number, "max": number }，不要写成单个数字或 "8000-10000" 字符串。

【JSON 结构（字段名与枚举值请原样遵守）】
${isResearch
    ? `{
  "version": 1,
  "projectMode": "research",
  "language": "${langCode}",
  "narrativeSummary": "...",
  "thesis": "...",
  "estimatedWordCount": { "min": 8000, "max": 10000 },
  "figurePlan": {
    "totalMin": 3,
    "totalMax": 5,
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
        "dataSource": "experiment"
      },
      {
        "id": "fig-3",
        "sectionPath": "结果与分析 > 机理",
        "type": "schematic",
        "purpose": "机理示意",
        "suggestedCaption": "图3 作用机理示意",
        "priority": "optional",
        "dataSource": "synthesis"
      }
    ]
  },
  "sectionGuides": [
    {
      "sectionPath": "引言",
      "purpose": "...",
      "keyPoints": ["研究背景", "科学问题"],
      "estimatedParagraphs": 4,
      "claim": "本节主张…",
      "evidenceHint": "需引用的文献主题…",
      "warrant": "证据如何支撑主张…"
    },
    {
      "sectionPath": "材料与方法",
      "purpose": "...",
      "keyPoints": ["试验设计", "测定方法"]
    },
    {
      "sectionPath": "结果与分析",
      "purpose": "...",
      "keyPoints": ["主要结果", "与文献对照"]
    }
  ],
  "writingOrder": ["材料与方法", "结果与分析", "引言", "结论"],
  "prerequisites": ["备齐试验数据"],
  "researchQuestion": "可选",
  "argumentGaps": [],
  "generatedAt": 0
}`
    : `{
  "version": 1,
  "projectMode": "review",
  "language": "${langCode}",
  "narrativeSummary": "...",
  "thesis": "...",
  "estimatedWordCount": { "min": 8000, "max": 12000 },
  "figurePlan": {
    "totalMin": 2,
    "totalMax": 4,
    "items": [
      {
        "id": "fig-1",
        "sectionPath": "引言",
        "type": "schematic",
        "purpose": "综述框架示意",
        "suggestedCaption": "图1 综述逻辑框架",
        "priority": "required",
        "dataSource": "synthesis"
      },
      {
        "id": "fig-2",
        "sectionPath": "研究进展综述",
        "type": "table",
        "purpose": "关键研究对比",
        "suggestedCaption": "表1 主要研究对比",
        "priority": "optional",
        "dataSource": "literature"
      }
    ]
  },
  "sectionGuides": [
    {
      "sectionPath": "引言",
      "purpose": "...",
      "keyPoints": ["背景与意义", "综述范围"],
      "estimatedParagraphs": 3,
      "claim": "本节主张…",
      "evidenceHint": "需覆盖的文献主题…",
      "warrant": "为何这些文献支撑该主张…"
    },
    {
      "sectionPath": "研究现状与问题",
      "purpose": "...",
      "keyPoints": ["已有共识", "争议与缺口"]
    },
    {
      "sectionPath": "研究进展综述",
      "purpose": "...",
      "keyPoints": ["主题一", "主题二"]
    }
  ],
  "writingOrder": ["研究现状与问题", "研究进展综述", "引言", "结论与展望"],
  "prerequisites": ["确认综述范围与核心文献"],
  "researchQuestion": "可选",
  "argumentGaps": [],
  "generatedAt": 0
}`}

【论文题目】${title}
【研究方向】${researchDirection}

【已确认大纲】
${outline}`;
}
