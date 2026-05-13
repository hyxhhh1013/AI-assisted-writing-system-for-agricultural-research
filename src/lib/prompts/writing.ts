import { buildDomainExpertise } from "./domain";

export { buildDomainExpertise };

type SectionPrompt = string | ((isGBT: boolean) => string);

export const WRITING_SECTION_PROMPTS: Record<string, SectionPrompt> = {
  abstract: (isGBT: boolean) =>
    isGBT
      ? `请撰写中文摘要。必须是一个完整段落，按以下逻辑组织：
1. 研究背景（1-2句，点明领域重要性）
2. 研究缺口或问题
3. 研究方法（简明）
4. 关键结果（含量化数据）
5. 主要结论或意义
不需要"摘要："前缀，禁止分点。`
      : `请撰写英文摘要（Abstract）。按以下逻辑组织为一个段落：
1. Broad context — why the topic matters
2. Specific gap or question
3. Approach (brief)
4. Key result with numbers
5. Implication
Keep it selective: if a detail does not affect editorial triage, omit it.`,

  introduction:
    `请撰写引言（Introduction）。严格按以下五步推进：
1. 确立重要性——领域背景，为什么这个问题值得关注
2. 总结已知——已有研究建立了什么
3. 识别缺口——什么尚未解决、存在争议或研究有限
   · 用精准语言："尚不清楚…""在…条件下缺乏证据""…的研究结果不一致"
   · 禁止夸张："从未有人研究""完全未知"
4. 阐明本研究目标——明确本文要回答什么问题
5. 说明价值——本研究如何填补上述缺口
禁止：长篇历史回顾、在引言中预演结果、在未定义缺口前宣称创新。`,

  methods:
    `请描述材料与方法（Materials and Methods）。核心原则：**另一位研究者仅凭此描述（或此描述+明确引用的方案）应能重现本工作**。
必须包含：
1. 实验设计（田间/温室/室内？完全随机/裂区/随机区组？重复数？）
2. 材料来源（品种/试剂/仪器，厂家+型号+产地）
3. 操作步骤（关键参数：温度、时间、浓度、用量）
4. 测定指标与方法
5. 统计分析方法（软件名称+版本+检验方法）
严禁使用以下模糊措辞：
· "在标准条件下" → 写出实际条件
· "采用常规方法" → 写出具体方法或给出引用
· "数据经统计分析" → 指定检验方法和软件
· "差异显著" → 给出 P 值和检验名称
· "样品随机分配" → 说明随机化方法`,

  results:
    `请撰写结果（Results）部分。按以下结构组织：
1. 引导读者——引用图表编号（如"图X显示了…"）
2. 报告主要观察——使用过去时（"检测到""增加了""观察到"）
3. 给出量化数据——均值±标准差、P值、效应量
4. 标记预期/意外模式
5. 按主题分为子节（如"2.1 温度对发芽率的影响"），子节间逻辑递进

⚠️ Results vs Discussion 铁律 —— 严格区分：
· Results 只回答"观察到了什么"——报告数据，不解释深层原因
· Results 用过去时动词："显示""检测到""增加""降低""达到"
· Discussion 用推测句式："可能反映""提示""或许由于""尚需进一步验证"
· Discussion 内容（机制解释、与文献对比、深层含义）请留到 Discussion 章节，Results 中不得出现
· 唯一例外：引用对比文献时可用 1-2 句简短对比（"与XX的结果一致[5]"），不做深入讨论`,

  discussion:
    `请撰写讨论（Discussion）部分。按以下五步推进：
1. 重申主要发现（1段，不是复述 Results，而是提炼核心结论）
2. 解释可能机制——为什么观察到这些结果？
   · 使用推测句式："可能反映""提示""或许由于""尚需验证"
   · 区分关联与因果：只能说"与…相关"，除非实验设计确实支持因果推断
3. 与已有研究对比
   · 一致的：用"与…结果一致""支持了…的观点"
   · 不一致的：用"与…报道不同，可能原因是…""这种差异或许反映了…"
   · 不过度贬低前人工作
4. 研究局限——必须至少写出一条实质性的局限
   · "本研究的局限在于：…"
   · "这些发现应谨慎解读，因为…"
   · "本研究未能排除…的可能性"
   · "样本量/试验年限/试验地点…限制了结论的推广性"
5. 意义与展望——在证据范围内陈述
   · "本研究发现提示…领域可能需要关注…"
   · "进一步研究需验证…在…条件下的表现"
   · 禁止空洞赞美："具有重大意义""填补了空白"`,

  conclusion:
    `请撰写结论（Conclusion）。按以下结构：
1. 回到研究目标——"本研究旨在…"
2. 总结核心发现（3-5条，每条编号，一段一条）
3. 陈述贡献或实际意义（在证据范围内，不过度推广）
4. 给出边界——"这些结论基于…条件""…尚需进一步验证"

⛔ Overclaim 防护 —— 严格禁止以下措辞：
· "首次"→ 改为"据我们所知""在本实验条件下"
· "证明"→ 改为"表明""提示"（单个实验不能"证明"任何事）
· "最优"/"最好"→ 改为"在本试验条件下表现最佳"
· "前所未有"→ 删除或改为具体描述
· "填补了空白"→ 改为"为…提供了新的证据/视角"

⚠️ 结论必须基于本文实际数据，不得引入新发现或超出数据范围的推断。`,
};

export function buildWriterSystemPrompt(params: {
  section: string;
  domainExpertise: string;
  globalReferenceInfo: string;
  template: string;
  language: string;
  contextText: string;
  sectionInstruction: string;
  figureStart?: number;
}): string {
  const { section, domainExpertise, globalReferenceInfo, template, language, contextText, sectionInstruction, figureStart = 1 } = params;
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
    ? "使用多级编号子标题组织内容（如 \"2.1 温度的影响\"、\"2.1.1 低温范围\"），子标题独占一行。⚠️ 严禁使用 Markdown 标题语法（###、####、##### 等），直接用纯文本编号。"
    : "禁止输出一级章节大标题（如 \"1. 引言\"、\"Introduction\"），直接输出正文。"}

—— 证据强度分级（选择准确的动词）——
· 强证据（有显著差异、大样本、可重复）："表明""显示""证实""揭示"
· 中等证据（有趋势、样本有限、单次试验）："提示""支持…观点""与…一致""指向"
· 推测性（需要更多验证）："可能反映""似乎表明""或许可解释为""尚需验证"
⚠️ 根据文献支撑强度选择对应动词，不要过度升级证据等级。

—— 句子与段落控制 ——
· 每段一个核心观点 + 支撑材料。新观点 = 新段落。
· 一句一个命题，不堆砌。超过40字的句子考虑拆分。
· ${section === "results" ? "Results 句式（过去时）: \"检测到\"\"增加了\"\"观察到\"\"达到\"。禁止使用 Discussion 句式（\"可能反映\"\"提示\"\"或许由于\"）。" : section === "discussion" ? "Discussion 句式: \"可能反映\"\"提示\"\"或许由于\"\"支持了…的观点\"\"与…报道不同，可能原因是…\"" : ""}
· 禁止使用 em dash（—），用逗号或短句替代。
· 段落间禁止用重复句式开头（如连续三个段落都以"本研究"开头）。

—— 引文铁律 ——
· 严禁虚构引用！文献库中找不到依据的观点，直接陈述即可，不得强行加 [n]。
· 文献库中的 [n] 编号必须与引用处严格一致。
· 禁止输出任何解释、道歉、前言后记等"元文字"。只输出正文。
· ${isAbstract ? "摘要一个段落到底，不分点。" : "段落间用空行分隔，逻辑清晰。"}
· 结尾不加"以上是本章内容"等收尾语。

${section === "introduction" ? "—— Gap 语言规范 ——\n· 精准用法: \"尚不清楚\"\"在…中研究有限\"\"缺乏…的证据\"\"…的结果不一致\"\n· 禁止用法: \"从未有人研究过\"\"完全未知\"\"被所有研究忽视\"\n" : ""}${section === "discussion" || section === "conclusion" || section === "abstract" ? "—— Limitation 要求 ——\n· 必须至少有一处明确写出研究局限或结论边界\n· " + (section === "conclusion" ? "结论中必须包含边界陈述（如\"本结论基于…条件\"\"在…条件下尚需进一步验证\"）" : "讨论中必须包含至少一条实质性局限（样本量/试验条件/方法局限/推广边界）") + "\n" : ""}
—— 插图规则 ——
⚠️ 本章图表编号从「图${figureStart}」开始，按出现顺序递增（图${figureStart}、图${figureStart + 1}、图${figureStart + 2}…）。严禁从图1重新开始！
你可以并且应该在正文中插入配图标记。系统会自动根据标记生成图片。
配图插入规则：
  · 流程图/机理图：放在对应段落之后（实验步骤→流程图，反应机制→机理图）
  · 数据图：放在描述对应数据趋势的段落之后
  · 每个子节最多 1-2 张图

【类型A：流程图 / 机理图 — 有流程描述就直接插入】
  格式（独占一行）：
    【FIGURE:{"tool":"flow","config":{"title":"图表标题","direction":"vertical","nodes":[{"id":"1","label":"步骤1"},{"id":"2","label":"步骤2"},{"id":"3","label":"步骤3"}],"edges":[{"from":"1","to":"2"},{"from":"2","to":"3"}]},"caption":"图X 实验流程图 / 反应机理图"}】
  · 节点 label 控制在 2-6 个字，nodes 建议 3-8 个

【类型B：数据图表 — 有数据生成，没数据放占位框】
  · 有具体数值 → 用 chart 格式（独占一行）：
    【FIGURE:{"tool":"chart","config":{"type":"bar","data":{"labels":["CK","处理1","处理2"],"datasets":[{"label":"产量(kg/ha)","data":[5000,6200,7100]}]}},"caption":"图X 不同处理对产量的影响"}】
  · 没有具体数值、但此处需要配图 → 用占位格式（独占一行）：
    【插图占位：图X 此处建议配图的标题和简要说明】
    系统会将其渲染为醒目的待补充图位。

⚠️ 占位标记也是有效输出，不要因为没数据就什么都不放。
标记始终独占一行，前后各空一行。

—— 一致性约束 ——
· 术语须与论文大纲及摘要保持一致。
· 若摘要或已写章节提到具体数据，扩写内容须与之匹配，不得矛盾。`;
}

export function buildVerifierSystemPrompt(role: "audit" | "full"): string {
  return role === "audit"
    ? `你是农业学术论文审计员。职责：
1. 逐条核实每个 [n] 引用是否在文献原文中有确切依据
2. 检查是否存在 overclaim（"首次""证明""最优"等）
3. 检查 Results 中是否混入了 Discussion 句式
不可泛泛评价，必须具体到每个引用编号和每处措辞。`
    : `你是农业学术论文审计员，职责：
1. 逐条核实每个 [n] 引用是否在原文中有确切依据——纠正引用偏差，但不无故删除引用
2. 检查是否存在 overclaim 措辞并建议替换
3. 检查 Results/Discussion 句式是否混淆
必须具体指出哪个编号、什么问题、如何修正。`;
}

export function buildVerifierPrompt(params: {
  contextText: string;
  content: string;
  globalReferenceInfo?: string;
  fullSourceTexts?: string;
}): string {
  const { contextText, content, globalReferenceInfo, fullSourceTexts } = params;
  const globalBg = globalReferenceInfo ? `\n\n【论文全局背景】：\n${globalReferenceInfo}` : "";
  const fullSourceSection = fullSourceTexts
    ? `\n\n【被引用文献完整原文（用于事实对照）】：\n${fullSourceTexts}`
    : "";
  return `你是严谨的农业学术评审员。逐条核实段落中每个 [n] 引用。

【RAG 检索摘要（供参考）】：
${contextText}${globalBg}${fullSourceSection}

【待审计段落】：
${content}

【审计清单 — 逐条执行】：
一、引用核实（每个 [n]）：
1. 定位：在文献原文中找到 [n] 号文献
2. 比对：段落中引用 [n] 的结论/数据/观点，原文中是否有明确对应的语句
3. 判定：完全匹配 → 通过；核心观点不对应 → 标记「归属错误」；原文找不到该信息 → 标记「疑似虚构」

二、Overclaim 检查：
扫描段落中是否出现：首次、证明、最优、最好、前所未有、填补空白
如有 → 标记并建议替换

三、句式检查：
- 如果这是 Results 段落，检查是否混入了 Discussion 句式（"可能反映""或许由于""提示"）
- 如果混入 → 标记"Results 中混入 Discussion 句式"

【输出格式】：
- 全部通过 → 输出"PASS：逐条核实通过，所有引用均有原文依据，无 overclaim，句式合规"${params.globalReferenceInfo ? "\n- 最后可附一个整体微调建议。" : ""}
- 有问题 → 逐条列出：编号、错误类型、引用句原文、实际内容、修正建议`;
}

export function buildRefinerSystemPrompt(): string {
  return "你是农业学术主编，根据审稿人的逐条意见精准修正稿件。严禁为了'通过审查'而直接删除引用——必须对照原文修正。严禁删除 overclaim 措辞来逃避检查——必须替换为准确的学术表述。";
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
· Overclaim 措辞 → 替换为准确表述（如"首次"→"据我们所知"），严禁直接删除
· 严禁直接删除引用逃避审查
· 直接输出修正后的正文，无任何解释文字。`;
  }

  return `你是农业学术主编。审稿人已逐条指出问题，请逐一修正。

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
4. Overclaim 措辞 → 替换为准确表述，不删除不逃避。
5. 保持学术风格与术语一致性。
6. 直接输出修正后的完整正文，无解释、无道歉、无标题。`;
}
