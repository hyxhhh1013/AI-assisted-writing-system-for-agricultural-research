import type { ProjectWritingMode } from "@/contracts/writing-mode";
import { buildDomainExpertise } from "./domain";
import { REVIEW_SECTION_PROMPTS } from "./review-writing";
import {
  buildReviewSynthesisWriterBlock,
  buildReviewVerifierChecklist,
  buildResearchVerifierChecklist,
} from "./review-synthesis-rules";
import type { SectionPrompt, SectionPromptParams } from "./writing-types";

export { buildDomainExpertise };

export type { SectionPrompt, SectionPromptParams };

export const WRITING_SECTION_PROMPTS: Record<string, SectionPrompt> = {
  abstract: ({ isChinese }: { isGBT: boolean; isChinese: boolean }) =>
    isChinese
      ? `请撰写中文摘要。**须基于已提供的全文各章内容综合提炼**，必须是一个完整段落，按以下逻辑组织：
1. 研究背景（1-2句，点明领域重要性）
2. 研究缺口或问题
3. 研究方法（简明）
4. 关键结果（含量化数据，须与正文一致）
5. 主要结论或意义
硬性要求：摘要中**禁止出现任何文献引用标记**（如 [1]、[2,3]）；不需要"摘要："前缀，禁止分点；不得编造正文未出现的数据。`
      : `Write the Abstract as one paragraph synthesized from the provided full-text sections:
1. Broad context — why the topic matters
2. Specific gap or question
3. Approach (brief)
4. Key result with numbers (must match the body)
5. Implication
Hard rules: NO in-text citations like [1]; do not invent numbers absent from the body.`,

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
5. 按主题分为子节（如"2.1 处理因素对观测指标的影响"），子节间逻辑递进

⚠️ Results vs Discussion 铁律 —— 严格区分：
· Results 只回答"观察到了什么"——报告数据，不解释深层原因
· Results 用过去时动词："显示""检测到""增加""降低""达到"
· Discussion 用推测句式："可能反映""提示""或许由于""尚需进一步验证"
· Discussion 内容（机制解释、与文献对比、深层含义）请留到 Discussion 章节，Results 中不得出现
· 唯一例外：引用对比文献时可用 1-2 句简短对比（"与XX的结果一致[5]"），不做深入讨论

⚠️ Results 中严禁重复 Methods 内容：
· 不得列出材料来源、试剂厂家、仪器型号、操作步骤
· 提及方法时简化为 "采用 2.1 节所述方法" 或引用章节编号
· 不要写 "3.1 材料与方法" 这类子标题`,

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

/** 按项目写作模式解析章节 Prompt */
export function resolveSectionPrompt(
  section: string,
  mode: ProjectWritingMode | undefined,
  opts: SectionPromptParams,
): string {
  const effectiveMode = mode === "research" ? "research" : "review";
  if (effectiveMode === "review" && section in REVIEW_SECTION_PROMPTS) {
    const reviewPrompt = REVIEW_SECTION_PROMPTS[section];
    return typeof reviewPrompt === "function" ? reviewPrompt(opts) : reviewPrompt;
  }
  const researchPrompt = WRITING_SECTION_PROMPTS[section];
  if (!researchPrompt) return "请根据以上信息进行专业扩写。";
  return typeof researchPrompt === "function" ? researchPrompt(opts) : researchPrompt;
}

/** 各引用格式的参考文献条目示例与规则 */
function buildCitationStyleBlock(style: string, isChinese: boolean): string {
  const blocks: Record<string, string> = {
    gbt7714: isChinese
      ? `—— 参考文献格式：GB/T 7714-2015（顺序编码制）——
· 期刊论文示例：
  [1] 张三, 李四, 王五. 水稻耐盐碱基因调控机制研究[J]. 作物学报, 2023, 49(5): 1234-1245. DOI: 10.3724/SP.J.1006.2023.12345.
· 书籍示例：
  [2] 赵六. 农业生物技术导论[M]. 北京: 科学出版社, 2022: 56-78.
· 学位论文示例：
  [3] 陈七. 盐碱胁迫下水稻产量形成机制研究[D]. 北京: 中国农业大学, 2021.
· 格式规则：
  - 期刊文章用 [J]，书籍用 [M]，学位论文用 [D]，会议论文用 [C]，报告用 [R]
  - 中文作者：姓名间用逗号分隔，超过 3 人写前 3 人加"等"
  - 英文作者：SURNAME A B（姓全写，名首字母），超过 3 人加"et al"
  - 卷号为粗体，格式"卷(期): 页码"，DOI 末尾加点`
      : `—— Reference Format: GB/T 7714-2015 ——
· Journal: Author AA, Author BB. Title[J]. Journal Name, Year, Vol(Issue): Pages. DOI: xx.
· Book: Author AA. Book Title[M]. Publisher, Year: Pages.
· Rules: Use document-type tags [J][M][D][C][R]; list all authors up to 3 then "et al".`,

    vancouver: isChinese
      ? `—— 参考文献格式：Vancouver（序号制，适用于医学/SCI 期刊）——
· 期刊论文示例：
  [1] Zhang S, Li M, Wang Q, et al. Salt stress mechanisms in rice varieties. Plant Cell Physiol. 2023;64(5):1234-45.
· 格式规则：
  - 作者姓 + 名字首字母，超过 6 人写前 6 人后加"et al"
  - 期刊名缩写（MEDLINE 格式），无需方括号文献类型标记
  - 格式：作者. 标题. 期刊名缩写. 年;卷(期):页码.`
      : `—— Reference Format: Vancouver ——
· Journal: Surname AB, Surname CD, et al. Title. J Abbrev. Year;Vol(Issue):Pages.
· Rules: Use MEDLINE journal abbreviations; ≤6 authors list all, >6 use "et al".`,

    apa7: isChinese
      ? `—— 参考文献格式：APA 7th Edition（作者-出版年制）——
· 期刊论文示例：
  Zhang, S., Li, M., & Wang, Q. (2023). Salt stress mechanisms in rice. Plant Cell Physiology, 64(5), 1234–1245. https://doi.org/10.1093/pcp/pcad012
· 格式规则：
  - 作者：Surname, Initials（逗号分隔，最后一人前加&）
  - 出版年紧跟作者后用括号括起
  - 正文引用用 (Zhang et al., 2023) 格式，不用 [n]`
      : `—— Reference Format: APA 7th Edition ——
· Journal: Surname, A. B., & Surname, C. D. (Year). Title. Journal, Vol(Issue), Pages. https://doi.org/xx
· In-text: (Zhang et al., 2023); list up to 20 authors before using ellipsis.`,

    ieee: isChinese
      ? `—— 参考文献格式：IEEE（适用于工程、电子类期刊）——
· 期刊论文示例：
  [1] S. Zhang, M. Li, and Q. Wang, "Salt stress mechanisms in rice varieties," Plant Cell Physiol., vol. 64, no. 5, pp. 1234–1245, May 2023.
· 格式规则：
  - 作者名字首字母在前，姓在后，用逗号连接，最后一人前加"and"
  - 标题用双引号括起
  - 期刊名斜体缩写，vol./no./pp. 小写
  - 正文中用右上角角标 [n] 引用`
      : `—— Reference Format: IEEE ——
· Journal: A. Surname, B. Surname, and C. Surname, "Title," J. Abbrev., vol. X, no. Y, pp. ZZ–ZZ, Month Year.
· Rules: Initials-first author names; title in quotes; abbreviated journal in italics.`,
  };

  return blocks[style] || blocks["gbt7714"];
}

export function buildWriterSystemPrompt(params: {
  section: string;
  domainExpertise: string;
  globalReferenceInfo: string;
  template: string;
  language: string;
  contextText: string;
  sectionInstruction: string;
  figureStart?: number;
  evidenceSummary?: string;
  projectMode?: "review" | "research";
  sectionNumber?: number;
  citationStyle?: string;
}): string {
  const { section, domainExpertise, globalReferenceInfo, template, language, contextText, sectionInstruction, figureStart = 1, evidenceSummary, projectMode, sectionNumber, citationStyle = "gbt7714" } = params;
  const isGBT = template === "gbt7713";
  const isChinese = language !== "en";
  const isAbstract = section === "abstract";
  const major = sectionNumber ?? 2; // 默认值 2 兼容旧调用

  const isReview = projectMode !== "research";
  const reviewSynthesisBlock =
    isReview && !isAbstract ? buildReviewSynthesisWriterBlock(isChinese) : "";

  if (isAbstract) {
    return `${domainExpertise}
你的任务是撰写论文摘要（Abstract）。模板：${isGBT ? "GB/T 7713 国标" : "SCI 国际期刊"}。输出语言：${isChinese ? "中文" : "英文"}。
${globalReferenceInfo}

—— 摘要写作铁律 ——
· 摘要必须基于上方「已完成正文」综合提炼；正文未写到的结论/数据不得编造
· **禁止任何文内引用标记**（[1]、[2,3]、[1-3]、【1】等一律不要）
· 一个紧凑段落，禁止分点、禁止输出「摘要：」前缀
· 禁止元文字、编辑批注、未完成标记

${sectionInstruction}
`;
  }

  const rigorBlock = isReview
    ? `—— 综述严谨性约束 ——
· 所有 borrowed 数据/结论须转述并标注 [n]，禁止照搬原文长句。
· 不得将他人试验结果表述为「本研究/本试验」的发现。
· 综合对比不同文献时注意条件差异，避免无出处的「普遍结论」。
· 避免 overclaim：首次、证明、最优、填补空白。`
    : `—— 科学严谨性约束 ——
· 结论只能基于当前实验的实际数据点做推断。禁止在未测试的取值区间声称"最优""最佳"等结论（例如实验只设置了 3 个梯度，就只能在 3 个实测点之间比较，不得推断未测区间的表现）。若需讨论趋势，使用"本实验条件下呈上升/下降趋势""推测在…范围内可能…"等审慎表达，并明确区分"实测结果"与"推测"。
· 避免 overclaim 措辞：不得使用"首次""证明""最优""彻底解决""完全阐明"等夸张用语。
· 若引用前人文献的数据做对比，必须明确标注"据文献[×]报道"，与本文实验数据区分。不得将文献结论当作本文实验结论。`;

  return `${domainExpertise}
你的任务是协助撰写论文「${section}」章节。模板：${isGBT ? "GB/T 7713 国标" : "SCI 国际期刊"}。输出语言：${isChinese ? "中文" : "英文"}。
${globalReferenceInfo}

—— 可供引用的文献库 ——
${contextText}
${evidenceSummary ? `\n—— 实验数据证据（定量结论必须引用编号） ——\n${evidenceSummary}\n` : ""}
—— 核心写作原则 ——
原则1·学术质量：使用专业术语，逻辑层层递进。${isGBT ? "遵循 GB/T 7713 学术表达习惯。" : "遵循 SCI 学术论文规范。"}
原则2·深度结合文献：每个主要观点应从文献库中寻找支撑或对比。正文中用半角方括号 [n] 标注引用（仅数字，如 [1]、[2,3]、[1-3]），编号须与文献库中 [参考来源 [n]] 严格对应。严禁使用 "[参考来源1]" "[文献2]" 等非标准格式；严禁用中文角括号【16】、全角方括号［16］标注引用——只能是 [16]、[16, 21] 这种半角方括号。${projectMode === "research" ? `\n原则2b·数据驱动写作：所有定量结论（数字、趋势、显著性）必须引用实验数据证据编号（如 [D1-C3]）。不得编造、修改证据声明中的数值。数据声明中的 text 字段可以直接改写为学术语言，但数值不可改变。` : ""}${reviewSynthesisBlock}
原则3·结构与配图：使用多级编号子标题组织内容（如 "${major}.1 关键因素的影响"、"${major}.1.1 某一水平下的表现"），子标题独占一行。⚠️ 严禁使用 Markdown 标题语法（###、####、##### 等），直接用纯文本编号。禁止输出一级章节大标题（如 "1. 引言"、"Introduction"）。禁止在章节末尾生成目录结构（列出所有子标题）——读者不需要在正文中看到目录。（如 "1. 引言"、"Introduction"）。子标题编号以 ${major} 开头（本节属于第 ${major} 章），第一小节从 ${major}.1 开始计数。

${isChinese ? `—— 证据强度分级（选择准确的动词）——
· 强证据（有显著差异、大样本、可重复）："表明""显示""证实""揭示"
· 中等证据（有趋势、样本有限、单次试验）："提示""支持…观点""与…一致""指向"
· 推测性（需要更多验证）："可能反映""似乎表明""或许可解释为""尚需验证"
⚠️ 根据文献支撑强度选择对应动词，不要过度升级证据等级。

—— 句子与段落控制 ——
· 每段一个核心观点 + 支撑材料。新观点 = 新段落。
· 一句一个命题，不堆砌。超过40字的句子考虑拆分。
· ${section === "results" ? "Results 句式（过去时）: \"检测到\"\"增加了\"\"观察到\"\"达到\"。禁止使用 Discussion 句式。" : section === "discussion" ? "Discussion 句式: \"可能反映\"\"提示\"\"或许由于\"\"支持了…的观点\"\"" : ""}
· 禁止使用 em dash（—），用逗号或短句替代。
· 段落间禁止用重复句式开头。

—— 引文铁律 ——
· 严禁虚构引用！文献库中找不到依据的观点，直接陈述即可。
· 文献库中的 [n] 编号必须与引用处严格一致。
· 引用格式唯一合法形态：半角方括号 + 数字，如 [3]、[2,5]、[1-3]。禁止【3】、［3］、(3) 等变体。
· 禁止输出解释、道歉、前言后记等"元文字"。只输出正文。
· ${isAbstract ? "摘要一个段落到底，不分点。" : "段落间用空行分隔，逻辑清晰。"}
· 结尾不加收尾语。

—— 元文字禁令 ——
以下内容绝不允许出现在输出中（包括方括号内）：
· 证据来源标注："[证据来源：...]"、"[需核实...]"、"[XXX，需补充]"
· 编辑指引："[此处应...]"、"[建议在...]"、含"需核实并添加至文献列表"的引用
· 自我审查："需要注意的是"开头的段落、"若需确证"、"应在后续修改中"
· 未完成引用：不得输出半截参考文献条目或带"需补充"标记的引用
上述任何形式出现在输出中均视为违规。

—— 中文写作质量 ——
· 空洞措辞禁用：禁止"具有重要的意义""展现出较大的潜力""引起了广泛关注"等虚词填充。用具体事实替代价值判断。
· 套话禁用：禁止"随着…的发展""在…背景下""众所周知""日益严峻"开头。
· 句子要求：每句有明确主语（本研究/该处理/温度/生物炭？），不用"被"字句堆砌。超过50字的句子必须拆分。
· 数据先行：能用数值不用形容词。"显著增加"→"增加了 27.4% (P<0.05)"；"大幅下降"→"从 2.1% 降至 0.4%"。无数据时不编造。

${section === "introduction" ? "—— Gap 语言规范 ——\n· 精准: \"尚不清楚\"\"在…中研究有限\"\"缺乏…的证据\"\"…的结果不一致\"\n· 禁止: \"从未有人研究过\"\"完全未知\"\n" : ""}${section === "discussion" || section === "conclusion" || section === "abstract" ? "—— Limitation 要求 ——\n· 必须至少有一处明确写出研究局限或结论边界\n" : ""}`
: `—— Evidence Strength (choose verbs carefully) ——
· Strong (significant, large sample, reproducible): "demonstrate" "show" "reveal" "establish"
· Moderate (trend, limited sample, single trial): "suggest" "indicate" "support the view that" "are consistent with"
· Speculative (needs validation): "may reflect" "could arise from" "appears to" "might be explained by"

—— Sentence & Paragraph Control ——
· One core idea + supporting material per paragraph. New idea = new paragraph.
· One proposition per sentence. Split sentences >30 words.
· ${section === "results" ? "Results: use PAST tense (\"was detected\" \"increased\" \"showed\"). Do NOT use Discussion language (\"may reflect\" \"suggests\")." : section === "discussion" ? "Discussion: use SPECULATIVE language (\"may reflect\" \"suggests that\" \"could indicate\" \"is likely due to\")." : ""}
· No em dashes. Use commas or shorter sentences instead.
· Vary paragraph openings; avoid repetitive sentence starters.

—— Citation Rules ——
· Never fabricate citations! If a claim has no support in the reference library, state it directly without [n].
· [n] numbers must match the reference library exactly.
· Output ONLY the body text. No meta-commentary, no introductions, no summaries at the end.
· ${isAbstract ? "Single paragraph, no bullet points." : "Separate paragraphs with blank lines."}

${section === "introduction" ? "—— Gap Language ——\n· Use: \"remains poorly understood\" \"has not been examined in\" \"few studies have addressed\"\n· Avoid: \"no one has ever studied\" \"completely unknown\"\n" : ""}${section === "discussion" || section === "conclusion" || section === "abstract" ? "—— Limitation Requirement ——\n· Must include at least one substantive limitation or boundary statement\n" : ""}`}
—— 数学公式规则 ——
· 所有数学公式必须用 $...$ 完整包裹，包括等号、运算符、数字。
· 正确示例：$Y_{bio-oil} = \\frac{m_{bio-oil}}{m_{raw}} \\times 100\\%$
· 错误示例：$\\frac{m_{bio-oil}}{m_{raw}}$ \\times 100\\%（运算符和数字在 $ 外面）
· 下标用 _{...}，上标用 ^{...}，都在 $ 内部。
· 独占一行的长公式用 $$...$$。

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
  ⚠️ nodes 和 edges 必须是数组 [...{...},{...}...]，绝不能漏掉最外层的方括号

【类型B：数据图表 — 有数据生成，没数据放占位框】
  · 有具体数值 → 用 chart 格式（独占一行）：
    【FIGURE:{"tool":"chart","config":{"type":"bar","data":{"labels":["对照组","处理组A","处理组B"],"datasets":[{"label":"观测指标","data":[100,135,160]}]}},"caption":"图X 不同处理对产量的影响"}】
  ⚠️ datasets / nodes / edges 必须是数组 [{...},{...}]，绝对不能写成 {...},{...} 或 "id":"1","label":"xx" 这种缺少[]包裹的格式（这会导致 JSON 解析失败，图表无法生成）
  · 没有具体数值、但此处需要配图 → 用占位格式（独占一行）：
    【插图占位：图X 此处建议配图的标题和简要说明】
    系统会将其渲染为醒目的待补充图位。

⚠️ 占位标记也是有效输出，不要因为没数据就什么都不放。
标记始终独占一行，前后各空一行。

—— 一致性约束 ——
· 术语须与论文大纲及摘要保持一致。
· 若摘要或已写章节提到具体数据，扩写内容须与之匹配，不得矛盾。

${rigorBlock}

${buildCitationStyleBlock(citationStyle, isChinese)}
· 引用参考文献时严禁使用 ".pdf" 后缀（如"Title of paper.pdf"）。
· 若无法确定某条文献的完整信息，使用标记 [文献×待补充] 而非编造不完整引用。
· 参考文献列表中的编号必须与正文引用一一对应，不得出现正文未引用的文献。`;
}

export function buildVerifierSystemPrompt(
  role: "audit" | "full",
  projectMode?: ProjectWritingMode,
): string {
  const jsonRule =
    "最终只输出一个 JSON 对象（passed/summary/issues），不要 markdown 围栏，不要前言后语。";
  if (projectMode !== "research") {
    return role === "audit"
      ? `你是文献综述学术诚信审计员。职责：
1. 核实 [n] 引用是否有原文依据、归属是否正确
2. 检测连续照搬原文（≥15 汉字）——要求转述改写
3. 检测他人数据是否被写成「本研究」结果
4. 检测无 [n] 的具体数值、overclaim、试验报告体例
必须具体到每个引用编号和每处措辞。${jsonRule}`
      : `你是文献综述审计员。职责：
1. 逐条核实 [n] 是否有原文依据
2. 标记疑似照搬、数据归属错误、未标注来源的数据
3. 检查是否符合综述体例（非 IMRaD 试验报告）
4. 检查 overclaim 并建议替换
必须指出哪个编号、什么问题、如何改写。${jsonRule}`;
  }
  return role === "audit"
    ? `你是农业学术论文审计员。职责：
1. 逐条核实每个 [n] 引用是否在文献原文中有确切依据
2. 检查是否存在 overclaim（"首次""证明""最优"等）
3. 检查 Results 中是否混入了 Discussion 句式
不可泛泛评价，必须具体到每个引用编号和每处措辞。${jsonRule}`
    : `你是农业学术论文审计员，职责：
1. 逐条核实每个 [n] 引用是否在原文中有确切依据——纠正引用偏差，但不无故删除引用
2. 检查是否存在 overclaim 措辞并建议替换
3. 检查 Results/Discussion 句式是否混淆
必须具体指出哪个编号、什么问题、如何修正。${jsonRule}`;
}

export function buildVerifierPrompt(params: {
  contextText: string;
  content: string;
  globalReferenceInfo?: string;
  fullSourceTexts?: string;
  projectMode?: ProjectWritingMode;
}): string {
  const { contextText, content, globalReferenceInfo, fullSourceTexts, projectMode } = params;
  const globalBg = globalReferenceInfo ? `\n\n【论文全局背景】：\n${globalReferenceInfo}` : "";
  const fullSourceSection = fullSourceTexts
    ? `\n\n【被引用文献完整原文（用于事实对照与照搬检测）】：\n${fullSourceTexts}`
    : "";
  const checklist =
    projectMode === "research"
      ? buildResearchVerifierChecklist()
      : buildReviewVerifierChecklist();

  return `你是严谨的农业学术评审员。${projectMode === "research" ? "逐条核实段落中每个 [n] 引用。" : "审查文献综述的引用规范、转述质量与数据归属。"}

【RAG 检索摘要（供参考）】：
${contextText}${globalBg}${fullSourceSection}

【待审计段落】：
${content}

${checklist}${globalReferenceInfo && projectMode === "research" ? "\n- 最后可附一个整体微调建议。" : ""}`;
}

export function buildRefinerSystemPrompt(projectMode?: ProjectWritingMode): string {
  const reviewNote =
    projectMode !== "research"
      ? `\n⚠️ 综述修正要点：
- 照搬原文 → 改写转述，保留 [n] 与数值
- 他人数据写成「本研究」→ 改为「据文献[n]报道」
- 流水账罗列 → 改为综合对比叙述\n`
      : "";
  return `你是农业学术主编，根据审稿人的逐条意见精准修正稿件。

严禁为了'通过审查'而直接删除引用——必须对照原文修正。
严禁删除 overclaim 措辞来逃避检查——必须替换为准确的学术表述。

⚠️ 引用缺失说明：
- 如果稿件中某处原文缺少引用编号（即该处应该引用文献但未标注 [n]），
  请从文献库中找到正确的引用来源，用正确的 [n] 编号在适当位置补充。

⚠️ 输出铁律 —— 违者视为失败：
- 严禁在输出中插入任何编辑备注、审稿说明、证据来源标注。
- 严禁输出 "[证据来源：...]"、"[需核实...]"、"含"需核实并添加至文献列表"的引用。
- 严禁输出以"需要注意的是""若需确证""应在后续修改中"开头的段落。
- 修正完成后的稿件必须是纯净的学术正文，不含任何元文字。
- 必须原样保留文中的【FIGURE:{...}】配图标记（含 JSON），不得删除、改写或转成普通文字描述。${reviewNote}`;
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
· 直接输出修正后的正文，无任何解释文字。
· 保留所有【FIGURE:{...}】配图标记原样不动（系统会自动生成图片）。`;
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
6. 直接输出修正后的完整正文，无解释、无道歉、无标题。
7. 保留所有【FIGURE:{...}】配图标记原样不动（系统会自动生成图片）。`;
}
