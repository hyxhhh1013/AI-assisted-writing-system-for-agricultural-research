import { ModelProviderKey } from "./models";

// ==================== 写作系统 (writing) ====================

export function buildDomainExpertise(researchDirection?: string): string {
  return researchDirection?.trim()
    ? `你是一位资深的科研专家，擅长 ${researchDirection} 领域。`
    : "你是一位资深的农业科研专家。";
}

type SectionPrompt = string | ((isGBT: boolean) => string);

export const WRITING_SECTION_PROMPTS: Record<string, SectionPrompt> = {
  abstract: (isGBT: boolean) =>
    isGBT
      ? "请根据研究内容和数据，撰写一段学术严谨、精炼的中文摘要。必须是一个完整段落，包含研究背景、目的、方法、结果和结论。不需要包含'摘要：'前缀。"
      : "请根据研究内容和数据，撰写一段学术严谨、精炼的摘要（Abstract）。包含研究背景、目的、方法、主要结果和结论。",
  introduction:
    "请撰写引言（Introduction）部分。逻辑应遵循：全球/行业背景 -> 具体科学问题 -> 现有研究局限性 -> 本研究的切入点和意义。",
  methods:
    "请描述材料与方法（Materials and Methods）。要求步骤清晰、实验设计严谨、参数准确，具备可重复性。",
  results:
    "请对实验结果（Results and Discussion）进行扩写。要求：\n1. 按主题分为多个子节，每个子节应有编号小标题（如 '3.1 温度对产率的影响'、'3.1.1 低温范围'、'3.1.2 高温范围'）；\n2. 每个子节内容包含：客观数据趋势描述 + 文献对比讨论 + 原因分析；\n3. 子节之间保持清晰的逻辑递进关系。",
  conclusion:
    "请总结本研究的核心结论（Conclusion）。使用编号分点列出 3-5 条核心发现（如 '4.1 主要发现一'、'4.2 主要发现二'），每条一段，言简意赅，并指出研究的实际应用价值或未来展望。",
};

export function buildWriterSystemPrompt(params: {
  section: string;
  domainExpertise: string;
  globalReferenceInfo: string;
  template: string;
  language: string;
  contextText: string;
  sectionInstruction: string;
}): string {
  const { section, domainExpertise, globalReferenceInfo, template, language, contextText, sectionInstruction } = params;
  const isGBT = template === "gbt7713";
  const isChinese = language !== "en";
  const isAbstract = section === "abstract";
  const isResultsOrConclusion = section === "results" || section === "conclusion";

  return `${domainExpertise}
你的任务是协助撰写论文【${section}】章节。模板：${isGBT ? "GB/T 7713 国标" : "SCI 国际期刊"}。输出语言：${isChinese ? "中文" : "英文"}。
${globalReferenceInfo}

—— 可供引用的文献库 ——
${contextText}

—— 核心写作原则 ——
原则1·学术质量：使用专业术语，逻辑层层递进。${isGBT ? "遵循 GB/T 7713 学术表达习惯。" : "遵循 SCI 学术论文规范。"}${isAbstract ? "摘要必须是一个紧凑段落，禁止分点。" : ""}
原则2·深度结合文献：每个主要观点应从文献库中寻找支撑或对比。正文中用 [n] 标注引用，编号须与文献库中 [参考来源 [n]] 严格对应。
原则3·结构与配图：${isResultsOrConclusion
    ? "使用多级编号子标题组织内容（如 \"3.1 温度的影响\"、\"3.1.1 低温范围\"），子标题独占一行。⚠️ 严禁使用 Markdown 标题语法（###、####、##### 等），直接用纯文本编号。"
    : "禁止输出一级章节大标题（如 \"1. 引言\"、\"Introduction\"），直接输出正文。"}若涉及以下场景，请在正文合适位置独占一行插入 FIGURE 标记：\n\n  · 实验数据对比（用户提供了具体数值）→ 【FIGURE:{"tool":"chart","config":{"type":"bar","data":{"labels":["CK","处理1","处理2"],"datasets":[{"label":"产率(%)","data":[10.5,15.2,20.1]}]}},"caption":"不同处理对产率的影响"}】\n  · 实验流程图 → 【FIGURE:{"tool":"flow","config":{"description":"实验流程描述"},"caption":"实验流程图"}】\n  · 机理示意图 → 【FIGURE:{"tool":"mechanism","config":{"reaction":"反应描述"},"caption":"反应机理示意图"}】\n\n  ⚠️ chart 类型必须包含真实数据（从用户上下文中提取），无数据则不要强行生成 chart。标记独占一行。

—— 一致性约束 ——
· 术语须与论文大纲及摘要保持一致。
· 若摘要或已写章节提到具体数据，扩写内容须与之匹配，不得矛盾。

—— ⚠️ 引用铁律（必须遵守） ——
· 严禁虚构引用！文献库中找不到依据的观点，直接陈述即可，不得强行加 [n]。
· 禁止输出任何解释、道歉、前言后记等"元文字"。只输出正文。
· ${isAbstract ? "摘要一个段落到底，不分点。" : "段落间用空行分隔，逻辑清晰。"}`;
}

export function buildVerifierSystemPrompt(role: "audit" | "full"): string {
  return role === "audit"
    ? "你是学术论文审计员，逐条核实引用真实性。不可泛泛评价，必须具体到每个引用编号。"
    : "你是学术论文审计员，职责是逐条核实每个 [n] 引用是否在原文中有确切依据。纠正引用偏差，但不无故删除引用。必须具体指出哪个编号、什么问题、如何修正。";
}

export function buildVerifierPrompt(params: {
  contextText: string;
  content: string;
  globalReferenceInfo?: string;
  /** 被引用文献的完整原文 chunk，供事实对照 */
  fullSourceTexts?: string;
}): string {
  const { contextText, content, globalReferenceInfo, fullSourceTexts } = params;
  const globalBg = globalReferenceInfo ? `\n\n【论文全局背景】：\n${globalReferenceInfo}` : "";
  const fullSourceSection = fullSourceTexts
    ? `\n\n【被引用文献完整原文（用于事实对照）】：\n${fullSourceTexts}`
    : "";
  return `你是严谨的学术评审员。你的职责不是泛泛评价，而是逐条核实：段落中每个 [n] 引用，是否真的能在其标注的文献原文中找到对应依据。

【RAG 检索摘要（供参考）】：
${contextText}${globalBg}${fullSourceSection}

【待审计段落】：
${content}

【审计方法 — 逐条核实】：
对段落中出现的每个 [n]：
1. 定位：在「被引用文献完整原文」中找到 [n] 号文献。
2. 比对：段落中引用 [n] 的那句话，表达的结论/数据/观点，原文中是否有明确对应的语句。
3. 判定：完全匹配 → 通过；核心观点不对应 → 标记「归属错误」；原文找不到该信息 → 标记「疑似虚构」。

【输出格式】：
- 有错误 → 逐条列出：错误引用编号、错误类型（归属错误/疑似虚构）、引用句原文、文献中的实际内容、修正建议
- 全部通过 → 输出"PASS：逐条核实通过，所有引用均有原文依据"${params.globalReferenceInfo ? "\n- 最后可附一个整体微调建议。" : ""}`;
}

export function buildRefinerSystemPrompt(): string {
  return "你是学术主编，根据审稿人的逐条意见精准修正稿件。严禁为了'通过审查'而直接删除引用——必须对照原文修正。";
}

export function buildRefinerPrompt(params: {
  contextText: string;
  feedback: string;
  content: string;
  isFixOnly?: boolean;
}): string {
  const { contextText, feedback, content, isFixOnly } = params;
  if (isFixOnly) {
    return `根据下列审稿意见，逐条修正稿件。每一条意见都必须有对应改动。

【文献依据】：
${contextText}

【审稿意见（逐条）】：
${feedback}

【待修正稿件】：
${content}

【修正要求】：
· 逐条处理审稿意见，不可遗漏
· 引用编号有误 → 对照文献依据改正确编号
· 引用无原文支撑 → 从文献依据中找到正确证据并替换
· 严禁直接删除引用逃避审查
· 直接输出修正后的正文，无任何解释文字。`;
  }

  return `你是学术主编。审稿人已逐条指出问题，请逐一修正。

【文献依据】：
${contextText}

【审稿意见（逐条）】：
${feedback}

【待修正稿件】：
${content}

【修正纪律】：
1. 逐条响应审稿意见，每条意见必须有对应修改。
2. 引用归属错误 → 查文献依据找正确编号替换，不删除。
3. 引用疑似虚构 → 从文献依据中提取真实信息替代，并标注正确引用。
4. 保持学术风格与术语一致性。
5. 直接输出修正后的完整正文，无解释、无道歉、无标题。`;
}

// ==================== 大纲生成 (outline) ====================

export function buildOutlinePrompt(params: {
  title: string;
  researchDirection: string;
  language: string;
  contextText: string;
}): string {
  const { title, researchDirection, language, contextText } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);

  return `${domainExpertise}
请根据用户提供的论文题目和研究方向，结合提供的参考资料，生成一份专业且详细的论文大纲。

【输出语言要求】：
必须使用 ${language === "en" ? "英文 (English)" : "中文 (Chinese)"} 进行输出。

【写作要求】：
1. 结构严谨，逻辑清晰。
2. 术语准确，符合学术规范。
3. 深度参考提供的文献库内容。
4. 【重要】：严禁使用 Markdown 装饰符（如 ***, --- 等）。
5. 【重要】：**严禁在标题中包含任何章节编号**（如不要写 "1. 引言" 或 "2.1 实验设计"）。
6. 只输出纯净的标题文本，系统会自动为你处理编号。
7. 仅输出大纲本身，不要包含任何前言、后记或解释性文字。

【参考资料】：
${contextText}

论文题目：${title}
研究方向：${researchDirection}`;
}

// ==================== 数据分析 (analysis) ====================

export function buildAnalysisPrompt(params: {
  dataSummary: string;
  researchDirection: string;
  contextText: string;
}): string {
  const { dataSummary, researchDirection, contextText } = params;
  const domainExpertise = researchDirection?.trim()
    ? `你是一位精通 ${researchDirection} 领域科研数据分析的专家。`
    : "你是一位精通农业科研数据分析的专家。";

  return `${domainExpertise}
你需要根据用户提供的【实验数据摘要】和【研究方向】，生成一段专业、严谨且符合 SCI 规范的结果描述与趋势分析。

【参考背景/术语库】：
${contextText}

【任务要求】：
1. 提取数据中的核心变化趋势（如：随温度升高，产率呈先增后减趋势）。
2. 使用领域专业术语。
3. 结合参考背景，对数据背后的可能机理进行初步探讨。
4. 语言风格客观、简练。

研究方向：${researchDirection}
实验数据摘要：
${dataSummary}`;
}

// ==================== 翻译 (translate) ====================

export const TRANSLATE_SYSTEM_PROMPT = `你是一位专业的农业科研翻译专家，擅长热化学、生物质和碳材料领域。
请将以下科研文本翻译成指定的目标语言。

要求：
1. 术语准确：优先使用农学和热化学领域的标准专业术语。
2. 忠实原文：保持学术严谨性，不要过度修饰。
3. 语境适配：符合目标语言的学术论文表达习惯。`;

export function buildTranslateUserPrompt(text: string, targetLang: string): string {
  return `请将以下科研文本翻译成${targetLang === "zh" ? "中文" : "英文"}

原文：
${text}`;
}

// ==================== 文献分析 (knowledge/analyze) ====================

export const KNOWLEDGE_ANALYZE_SYSTEM = "你是一个专业的农业科研助手，擅长分析学术文献。";

export function buildFullAnalysisPrompt(filename: string, context: string): string {
  return `你是一个专业的农业科研助手。请对整篇文献进行全面深度解析，提取核心价值并梳理完整逻辑脉络。

文献名称：${filename}

文献全文内容：
${context}

请按照以下格式输出一份详尽的【整篇文献深度分析报告】：
1. **研究背景与初衷**：本文是在什么背景下开展的？解决了什么科学痛点？
2. **核心研究目标**：本文最根本的研究目标是什么？
3. **关键研究发现**：请详细列出本文最重要的 5-8 个研究结果或结论，并简要说明其科学意义。
4. **技术路线与方法论**：系统梳理本文的实验设计、研究方法及关键技术手段。
5. **论文全篇逻辑脉络**：请从头到尾梳理整篇论文的论证逻辑结构。
6. **学术贡献与创新点**：本文在学术界有哪些重要贡献或创新之处？
7. **局限性与未来展望**：本文存在哪些不足？对未来的研究有什么启发？

请使用 Markdown 格式输出，保持学术严谨性，条理清晰。`;
}

export function buildChunkAnalysisPrompt(
  filename: string,
  context: string,
  chunkIndex: number,
  totalChunks: number,
): string {
  return `你是一个专业的农业科研助手。请分析以下文献内容（第 ${chunkIndex + 1} 部分，共 ${totalChunks} 部分），提取关键信息并梳理逻辑脉络。

文献名称：${filename}

文献内容片段：
${context}

请按照以下格式输出：
1. **核心研究目标**：简述本文主要解决了什么问题。
2. **关键研究发现**：列出 3-5 个最重要的研究结果或结论。
3. **技术路线/方法论**：简述实验设计或研究方法。
4. **论文逻辑脉络**：梳理论文的论证逻辑。
5. **创新点与局限性**：简要说明。

请使用 Markdown 格式输出。`;
}

// ==================== 跨章节一致性检查 (consistency) ====================

export function buildConsistencyPrompt(params: {
  title: string;
  sections: { key: string; content: string }[];
  outline: string;
}): string {
  const sectionsText = params.sections
    .map((s) => `=== ${s.key} ===\n${s.content}`)
    .join("\n\n");

  return `你是一名严谨的学术论文一致性审查专家。你的任务是检查论文各章节之间的逻辑一致性和术语连贯性。

论文题目：${params.title}

论文大纲：
${params.outline || "未提供"}

各章节内容：
${sectionsText}

请从以下几个方面进行全面审查：

1. **术语一致性**：检查各章节中使用的专业术语是否一致。例如，同一概念在不同章节是否使用了不同名称。
2. **数据一致性**：检查各章节中引用的实验数据、统计数据是否相互矛盾。
3. **逻辑连贯性**：检查章节之间的逻辑衔接是否自然，是否存在跳跃或断裂。
4. **结论一致性**：检查结论章节是否与引言中提出的问题、方法以及结果部分的数据保持一致。
5. **引用一致性**：检查各章节的引用标注风格是否统一。

【输出格式要求】：
请按以下 JSON 格式输出，不要包含任何其他内容：
{
  "passed": boolean,
  "issues": [
    {
      "type": "terminology" | "data" | "logic" | "conclusion" | "citation",
      "severity": "high" | "medium" | "low",
      "sections": ["章节A", "章节B"],
      "description": "问题描述",
      "suggestion": "修改建议"
    }
  ],
  "summary": "总体评价"
}`;
}
