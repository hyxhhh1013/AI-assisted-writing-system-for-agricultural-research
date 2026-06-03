import type { SectionPrompt } from "./writing-types";

type PromptParams = { isGBT: boolean; isChinese: boolean };

/** 综述模式专用章节 Prompt — 主题分类 + 文献综合，禁止实验报告语体 */
export const REVIEW_SECTION_PROMPTS: Record<string, SectionPrompt> = {
  abstract: ({ isChinese }: PromptParams) =>
    isChinese
      ? `请撰写中文摘要（综述型）。一个完整段落，按以下逻辑组织：
1. 领域背景与综述必要性（1-2句）
2. 本文综述范围与组织方式
3. 主要进展或共识（概括性，不罗列试验细节）
4. 主要争议、空白或趋势
5. 结论性判断或展望方向
禁止出现「本试验」「本研究采用」「材料与方法」等原创实验表述。`
      : `Write a review abstract as one paragraph:
1. Why this topic warrants synthesis now
2. Scope and organization of the review
3. Major advances or consensus (synthetic, not experimental detail)
4. Key controversies, gaps, or emerging trends
5. Concluding outlook
Do NOT describe original experiments or methods.`,

  introduction: ({ isChinese }: PromptParams) =>
    isChinese
      ? `请撰写综述引言。按以下结构推进：
1. 领域重要性与现实/科学意义
2. 为何此时需要系统综述（研究积累、应用需求、政策或产业背景）
3. 已有工作的总体脉络（高度概括，不展开细节）
4. 现有综述或研究的不足（范围窄、结论不一致、缺乏某维度综合等）
5. 本文综述的目标、范围与文章结构安排
禁止：预演各主题细节、写成实验设计说明、使用「本试验」表述。`
      : `Write the Introduction for a literature review:
1. Significance of the field
2. Why synthesis is needed now
3. Broad landscape of prior work (high-level)
4. Gaps in existing reviews or literature
5. Objectives, scope, and structure of this review
Do NOT preview detailed themes or describe original experiments.`,

  background: ({ isChinese }: PromptParams) =>
    isChinese
      ? `请撰写「研究现状与问题」章节。这是综述的概念与问题框架层，侧重：
1. 核心概念、分类体系或研究对象界定（必要时给出操作性定义）
2. 该领域研究的整体分布（地域、材料、方法路线等，基于文献综合）
3. 当前公认的主要问题、瓶颈或应用约束
4. 不同研究路线或观点的分野（为后文主题综述铺垫）
写作要求：以文献综合为主，对比不同来源观点；可适度使用「研究表明」「多数研究认为」；禁止写成单次试验的流程描述。
引用格式：正文仅使用半角方括号 [1]、[2,3]、[1-3] 标注文献，严禁【16】、［16］等变体。`
      : `Write the Background section establishing concepts and problems:
1. Key concepts, taxonomy, or scope definitions
2. Overall distribution of research (themes, regions, approaches) from literature
3. Recognized bottlenecks or constraints
4. Major divides among research lines (bridge to thematic review)
Synthesize literature; do NOT describe a single original experiment.`,

  literature_body: ({ isChinese }: PromptParams) =>
    isChinese
      ? `请撰写「研究进展综述」主体章节。这是综述的核心，必须：
1. 按**主题/机制/应用维度**组织子节（如 3.1、3.2、3.3），子节标题应体现分类逻辑
2. 每个子节内：概述该主题研究脉络 → 综合多项研究结论 → 对比异同 → 指出局限或争议
3. 优先使用综合叙述（「多项研究表明…」「然而，…结果存在差异」），避免逐篇流水账
4. 引用他人数据时必须转述 + [n]：禁止连续照搬原文 ≥15 字；数值可保留但须标注来源
5. 适当引用 [n] 支撑每个主要判断
严禁：
· 「本试验」「本研究采用」「试验设计」「随机区组」等原创实验语体
· 把综述写成 Methods/Results 结构
· 无依据的具体数值（除非文献库中有明确数据且标注引用）`
      : `Write the main Literature Review body:
1. Organize by themes/mechanisms/applications (numbered subsections)
2. Per theme: trace research → synthesize findings → compare studies → note limits/disputes
3. Prefer synthetic prose over paper-by-paper lists
4. Paraphrase borrowed data with [n]; no ≥10-word verbatim copying
5. Support major claims with [n] citations
Do NOT use original-experiment language (we conducted, our trial, materials and methods).`,

  conclusion: ({ isChinese }: PromptParams) =>
    isChinese
      ? `请撰写综述的「结论与展望」：
1. 回扣综述目标，提炼 3-5 条综合性结论（跨主题，不是重复各节摘要）
2. 明确仍存在的知识空白或方法学不足
3. 提出未来研究重点（可区分基础机制、应用验证、标准化等方向）
4. 如有，简要讨论对产业/政策/实践的启示（基于文献，不过度外推）
禁止引入文中未讨论的新主题；禁止声称本文做了原创实验。`
      : `Write Conclusion and Outlook for the review:
1. 3-5 integrative conclusions across themes
2. Remaining knowledge or methodological gaps
3. Future research priorities
4. Brief implications if supported by cited literature
Do not claim original experiments were conducted in this paper.`,
};
