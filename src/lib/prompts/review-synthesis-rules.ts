/**
 * 综述写作 / 核查共用规则 — 防止照搬原文、数据归属错误
 */

export function buildReviewSynthesisWriterBlock(isChinese: boolean): string {
  if (isChinese) {
    return `
—— 综述引用与数据规范（学术诚信，必须遵守）——
原则2c·二次文献规范：
· 本文是**文献综述**，不报告原创试验；禁止「本试验」「本研究测得」「我们采用…设计」等表述。
· 引用他人结论或数据时，必须用综合转述 + [n] 标注来源，例如：「据 Zhang 等报道，…[3]」「多项研究提示…[2,5]」。
· **引用括号**：仅允许半角方括号 [n]；禁止把文献编号写在中文角括号【16】或全角方括号［16］内。
· **严禁**从文献库/RAG 片段中**连续照搬 ≥15 个汉字**（或英文 ≥10 个连续词）——必须改写句式与语序，保留事实与数值但换表述。
· 出现具体数值、百分比、P 值、样本量时：**必须**紧跟 [n]，且数值不得改动；不得把他人数据写成「本文/本研究」的结果。
· 优先「多项研究表明…」「然而结论存在分歧…」等综合叙述；避免逐篇流水账（「A 做了… B 做了…」）。
· 对比不同文献时明确条件差异（材料、尺度、指标），不得合并为无出处的「普遍结论」。
· 若文献库无足够依据，用概括性表述，**不要编造**具体数据。`;
  }
  return `
—— Literature review citation & data integrity ——
· This is a synthesis paper, NOT an original experiment. No "we conducted", "our trial", "materials and methods".
· Attribute all borrowed findings/data with paraphrase + [n]. Never present cited data as this paper's own results.
· Do NOT copy ≥10 consecutive words verbatim from source snippets—rephrase while preserving facts and numbers.
· Any statistic, %, P-value, or n must have [n] immediately attached; do not alter cited numbers.
· Prefer synthetic prose over paper-by-paper lists.`;
}

export function buildReviewVerifierChecklist(): string {
  return `【审计清单 — 文献综述专用，逐条执行】：

一、引用与事实核实（每个 [n]）：
1. 该 [n] 是否在文献原文/RAG 片段中有对应依据？
2. 归属是否正确（没有把 A 文献的结论标成 B 文献）？
3. 数值是否与原文一致（未篡改）？

二、照搬与改写（学术不端风险）：
1. 对照【被引用文献完整原文】，是否存在**连续 ≥15 汉字**（或英文 ≥10 词）与原文几乎相同？
   → 标记「疑似照搬」，要求改写并保留 [n]
2. 是否把他人试验数据写成「本研究/本试验/我们」的结果？
   → 标记「数据归属错误」

三、数据引用规范：
1. 具体数值、百分比、显著性是否均标注 [n]？
2. 无 [n] 的具体数据 → 标记「未标注来源的数据」

四、综述体例：
1. 是否写成 IMRaD 试验报告（材料与方法、试验设计、本研究测得）？
2. 是否仅为文献罗列、缺乏综合与对比？
3. Overclaim：首次、证明、最优、填补空白 → 标记并建议替换

【输出格式 — 必须只输出一个 JSON 对象，不要 markdown 围栏】：
{"passed":true|false,"summary":"一句话总结","issues":[{"id":"v1","type":"overclaim|citation_error|citation_fake|results_discussion_mix|data_claim_mismatch|terminology|vague_expression|verbatim_copy|data_attribution|other","severity":"high|medium|low","originalText":"问题原文片段","suggestion":"如何改写","evidence":"可选依据"}]}
- 全部通过：passed=true 且 issues=[]
- type 必须取上述枚举之一；找不到精确类型时用 other
- originalText / suggestion 必填；不要输出 JSON 以外的文字`;
}

export function buildResearchVerifierChecklist(): string {
  return `【审计清单 — 原创研究论文，逐条执行】：
一、引用核实（每个 [n]）：
1. 定位：在文献原文中找到 [n] 号文献
2. 比对：段落中引用 [n] 的结论/数据/观点，原文中是否有明确对应的语句
3. 判定：完全匹配 → 通过；核心观点不对应 → 标记 citation_error；原文找不到该信息 → citation_fake

二、Overclaim 检查：
扫描段落中是否出现：首次、证明、最优、最好、前所未有、填补空白 → type=overclaim

三、句式检查：
- Results 段落混入 Discussion 句式（"可能反映""或许由于""提示"）→ results_discussion_mix

【输出格式 — 必须只输出一个 JSON 对象，不要 markdown 围栏】：
{"passed":true|false,"summary":"一句话总结","issues":[{"id":"v1","type":"overclaim|citation_error|citation_fake|results_discussion_mix|data_claim_mismatch|terminology|vague_expression|verbatim_copy|data_attribution|other","severity":"high|medium|low","originalText":"问题原文片段","suggestion":"如何改写","evidence":"可选依据"}]}
- 全部通过：passed=true 且 issues=[]
- 不要输出 JSON 以外的文字`;
}
