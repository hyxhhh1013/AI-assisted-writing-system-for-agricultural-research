import type { ProjectWritingMode } from "@/contracts/writing-mode";
import { getProjectWritingMode, getSectionLabelForMode } from "@/lib/section-registry";

type DataClaim = { id: string; text: string; values: Record<string, number | string> };

export function buildConsistencyPrompt(params: {
  title: string;
  sections: { key: string; content: string }[];
  outline: string;
  projectMode?: ProjectWritingMode;
  dataClaims?: DataClaim[];
}): string {
  const mode = getProjectWritingMode(params.projectMode);
  const sectionsText = params.sections
    .map((s) => {
      const label = getSectionLabelForMode(s.key, mode);
      return `=== ${label} (${s.key}) ===\n${s.content}`;
    })
    .join("\n\n");

  const dataClaimsText =
    params.dataClaims && params.dataClaims.length > 0
      ? `\n已提取的数据证据声明（必须引用编号）：\n${params.dataClaims.map((c) => `[${c.id}] ${c.text}`).join("\n")}\n`
      : "";

  return mode === "research"
    ? buildResearchConsistencyPrompt(params.title, params.outline, sectionsText, dataClaimsText)
    : buildReviewConsistencyPrompt(params.title, params.outline, sectionsText, dataClaimsText);
}

function buildResearchConsistencyPrompt(
  title: string,
  outline: string,
  sectionsText: string,
  dataClaimsText: string,
): string {
  return `你是农业学术论文一致性审查专家。检查**研究论文**各章节之间的逻辑一致性和术语连贯性。

论文题目：${title}

论文大纲：
${outline || "未提供"}
${dataClaimsText}
各章节内容：
${sectionsText}

请从以下七个方面进行全面审查：

1. **术语一致性**：同一概念在各章节是否使用统一名称（品种名、处理代号、测定指标名称等）。

2. **数据一致性**：各章节中引用的实验数据、统计结果是否相互矛盾。例如：Results 中报的均值/D/P值与 Discussion/Conclusion 中的引用是否一致。

3. **逻辑连贯性**：章节间逻辑衔接是否自然。Introduction 提出的问题 → Results 呈现的发现 → Discussion 的解释 → Conclusion 的总结是否形成闭环。

4. **结论-证据一致性**：Conclusion 的每一条结论是否都能在 Results 中找到对应数据支撑。是否存在结论超出了实际数据范围的情况。

5. **Overclaim 扫描**：扫描全文中是否存在以下措辞：
   - "首次" / "证明" / "最优" / "最好" / "前所未有" / "填补了空白"
   - Results 中是否混入了 Discussion 句式（"可能反映""或许由于""提示"等推测性措辞）
   - 如有 → 标记位置并建议替换

6. **引用一致性**：各章节的引用标注风格是否统一，引用编号是否与文献列表对应。

7. **数据溯源检查**：文中所有定量结论（数字、百分比、统计值）是否标注了数据来源编号（如 [D1-C3]）。如果存在没有数据编号的数值声明，标记为"未溯源数据"。如果证据声明列表中存在编号但正文中缺失该编号，标记为"缺失数据引用"。

【输出格式】—— 严格 JSON，不要其他内容：
{
  "passed": boolean,
  "issues": [
    {
      "type": "terminology" | "data" | "logic" | "conclusion" | "overclaim" | "citation",
      "severity": "high" | "medium" | "low",
      "sections": ["章节A", "章节B"],
      "description": "问题描述（包含具体措辞或数据）",
      "suggestion": "修改建议"
    }
  ],
  "summary": "总体评价"
}`;
}

function buildReviewConsistencyPrompt(
  title: string,
  outline: string,
  sectionsText: string,
  dataClaimsText: string,
): string {
  const dataSection = dataClaimsText
    ? `\n8. **数据溯源检查**（若正文含定量表述）：与证据声明编号是否对应。\n`
    : "";

  return `你是农业学术**文献综述**一致性审查专家。检查综述各章节之间的论点连贯性、主题划分与引用规范（非实验论文的 Results/Methods 逻辑）。

论文题目：${title}

论文大纲：
${outline || "未提供"}
${dataClaimsText}
各章节内容：
${sectionsText}

请从以下方面审查（综述结构：引言 → 研究现状与问题 → 研究进展综述 → 结论与展望）：

1. **术语一致性**：同一概念、物种、工艺、指标在各章是否名称统一，缩写首次出现是否定义。

2. **主题与论点一致性**：Introduction 提出的综述问题/范围，是否在 Background 与 Literature Review 中被覆盖；各主题块之间是否重复或遗漏大纲要点。

3. **逻辑连贯性**：是否形成「问题界定 → 现状与空白 → 分主题文献综合 → 结论与展望」的递进；章节过渡是否自然，是否存在跳题。

4. **结论-文献一致性**：Conclusion 中的归纳、趋势判断、研究空白是否能在前文 Literature Review / Background 的论述与引用中找到依据；是否出现无文献支撑的空泛断言。

5. **Overclaim 扫描**：综述中慎用「首次全面」「 definitively 证明」「完全填补空白」等；区分「已有研究表明」与「本综述认为」；Background 与 Literature Review 是否混入未标注来源的原创实验结论。

6. **引用一致性**：引用编号格式、密度、与论述是否匹配；同一论断在不同章节引用是否矛盾或重复堆砌。
${dataSection}
【输出格式】—— 严格 JSON，不要其他内容：
{
  "passed": boolean,
  "issues": [
    {
      "type": "terminology" | "data" | "logic" | "conclusion" | "overclaim" | "citation",
      "severity": "high" | "medium" | "low",
      "sections": ["章节 key，如 background、literature_body"],
      "description": "问题描述（包含具体措辞）",
      "suggestion": "修改建议"
    }
  ],
  "summary": "总体评价"
}`;
}

/** 一致性定点修复 Prompt（API fix 路由使用） */
export function buildConsistencyFixPrompt(params: {
  title: string;
  relevantContent: string;
  issue: { type: string; severity: string; description: string; suggestion: string };
  projectMode?: ProjectWritingMode;
}): string {
  const mode = getProjectWritingMode(params.projectMode);
  const modeHint =
    mode === "review"
      ? "本文是**文献综述**，修正时保持综述语气（综合已有研究、标注引用），勿写成实验 Results/Methods 体例。"
      : "本文是**研究论文**，保持 IMRaD 体例与实验论述风格。";

  return `你是农业学术主编。请根据以下问题描述和修改建议，对论文相关内容进行定点修正。

${modeHint}

【论文题目】${params.title}

【当前章节内容】
${params.relevantContent}

【发现的问题】
类型：${params.issue.type}
严重程度：${params.issue.severity}
描述：${params.issue.description}

【修改建议】
${params.issue.suggestion}

【要求】
1. 仅输出修正后的段落文本（完整的替换段落），不要输出解释、道歉、或"以下是修改后的版本"等元文字
2. 保持原文的学术风格、术语体系、Markdown 格式
3. 只修改与问题直接相关的部分，其他内容原样保留
4. 如果问题涉及多个章节，只输出最相关章节的修正内容
5. 用 [SECTION:章节key] 标记修正内容所属的章节（如 introduction、background、literature_body）`;
}
