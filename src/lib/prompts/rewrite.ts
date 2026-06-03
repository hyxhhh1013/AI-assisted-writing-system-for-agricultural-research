/**
 * 降重改写 Prompt
 *
 * 4 种策略各自有独立的改写指令，不再只是"换个名字"。
 * 参考学术降重的专业技巧：主动/被动转换、长短句拆合、因果倒置、同义词替换、句式重构。
 */

import { buildDomainExpertise } from "./domain";
import type { RewriteStrategy } from "@/services/rewrite-service";

// ==================== 通用约束 ====================

const COMMON_CONSTRAINTS = `
【铁律——违反任何一条即为失败】
1. 禁止编造数据、篡改数值、凭空捏造实验结果
2. 禁止改变学术结论的核心含义（可调整表述，不可改变语义）
3. 禁止删除引用标记 [1][2][3] 等，保留所有参考文献引用
4. 禁止引入原文中没有的新观点、新论据、新数据
5. 禁止使用口语化表达（"其实"、"所以"、"我觉得"、"总的来说"）
6. 保持学术语气和专业术语，不降低论文的学术水准
7. 纯文本输出——禁止 Markdown 格式、编号列表、代码块、前缀说明
8. 保持段落数量不变（一段输入 → 一段输出）
9. 改写后长度与原文偏差不超过 ±25%
10. 保留所有数学公式、变量符号、单位格式
`;

// ==================== 策略指令 ====================

const STRATEGY_INSTRUCTIONS: Record<RewriteStrategy, string> = {
  synonym: `
【同义替换策略】
核心原则：保留句式结构不变，仅替换关键词和短语为同义词/近义词。

具体手法：
· 将动词替换为同义词：如"采用"↔"使用"↔"运用"，"表明"↔"显示"↔"揭示"
· 将形容词替换：如"显著"↔"明显"，"广泛"↔"普遍"，"重要"↔"关键"
· 将名词短语替换：如"热解温度"↔"裂解温度"，"生物质"↔"生物原料"
· 专业术语可替换为英文缩写或全称：如"扫描电子显微镜(SEM)"↔"SEM"
· 保留所有专业术语的核心含义，不改变术语的学术定义
· 不调整句子顺序，不拆分或合并句子
· 不改变段落的逻辑结构
`,

  rephrase: `
【改写语序策略】
核心原则：调整句子结构和语序，保留关键用词。

具体手法：
· 主动语态 ↔ 被动语态转换：如"本研究发现..." ↔ "通过本研究可以发现..."
· 陈述句 ↔ 倒装句：如"X 因素对 Y 有显著影响" ↔ "Y 的变化显著受到 X 因素的影响"
· 拆分长句为短句：将一个复杂长句拆成 2-3 个简单句
· 合并短句为长句：将多个简单句合并为一个复合句
· 调整段落内句子的先后顺序（保持逻辑连贯）
· 因果关系倒置表述：如"因为 A，所以 B" ↔ "B 的出现源于 A 的作用"
· 保留关键动词和名词，主要调整连接词和句式框架
`,

  summarize: `
【概括精简策略】
核心原则：压缩冗余描述，保留核心信息，使表达更精炼。

具体手法：
· 合并重复表述：如"该方法具有高效性、该方法具有便捷性" → "该方法高效便捷"
· 去除不必要的修饰词：如"非常"、"极其"、"相当"等程度副词
· 精简背景描述：保留核心论点，压缩铺垫性文字
· 用更简洁的表达替代冗长句式：如"在本研究中，我们通过实验的方法对..." → "本实验对..."
· 压缩举例说明：保留关键示例，删除重复或次要示例
· 绝对不能丢失任何关键数据（数值、百分比、样本量等）
· 绝对不能丢失任何结论性表述
· 改写后长度应比原文短 10-20%
`,

  expand: `
【扩写重组策略】
核心原则：拆分复杂概念，补充逻辑连接，使论证更清晰。

具体手法：
· 拆分复杂句子：将一个包含多个从句的长句拆成多个简单句
· 补充逻辑连接词：如"因此"、"然而"、"此外"、"具体而言"
· 为每个论点补充解释性内容：说明"为什么"和"意味着什么"
· 重组论证顺序：按逻辑递进关系重新排列子论点
· 补充方法论细节：增加实验条件、参数设置的描述
· 为结论添加限定语：如"在本实验条件下"、"基于现有数据"
· 改写后长度应比原文长 15-25%
· 不要为了扩写而加入空洞的套话
`,
};

// ==================== Prompt 构建 ====================

export function buildRewritePrompt(
  strategy: RewriteStrategy,
  originalText: string,
  contextText?: string,
  researchDirection?: string
): { system: string; user: string } {
  const domain = buildDomainExpertise(researchDirection);
  const strategyInstruction = STRATEGY_INSTRUCTIONS[strategy];

  const system = `${domain}

你是一位专业的学术论文降重改写专家。你的任务是按照指定的改写策略，对论文段落进行改写，使其在保持学术严谨性和原意的前提下，降低与已有文献的文本相似度。

${strategyInstruction}

${COMMON_CONSTRAINTS}

【输出格式】
只输出改写后的纯文本段落。不要加任何前缀（如"改写后："）、编号、解释、Markdown 格式。
直接输出改写结果，一个字都不要多。`;

  const userParts = [`【待改写原文】${originalText}`];
  if (contextText) {
    userParts.push(`【上下文参考】${contextText}`);
  }
  userParts.push(`请严格按照「${strategy === "synonym" ? "同义替换" : strategy === "rephrase" ? "改写语序" : strategy === "summarize" ? "概括精简" : "扩写重组"}」策略改写以上段落。`);

  return { system, user: userParts.join("\n\n") };
}

// ==================== 输出清理 ====================

/** 清理 AI 输出中的 Markdown 包裹、前缀说明等 */
export function cleanRewriteOutput(raw: string): string {
  let cleaned = raw.trim();

  // 移除 markdown code fence
  cleaned = cleaned.replace(/^```(?:text|markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // 移除常见前缀
  const prefixes = [
    /^改写后[：:]\s*/i,
    /^改写结果[：:]\s*/i,
    /^以下是改写后的内容[：:]\s*/i,
    /^根据.*?策略.*?改写[：:]\s*/i,
    /^【.*?】\s*/g,
  ];
  for (const prefix of prefixes) {
    cleaned = cleaned.replace(prefix, "");
  }

  // 移除尾部解释（不用 s 标志，用 [\s\S] 替代）
  const suffixes = [
    /\n*\n*(?:以上|以上是|这就是)[\s\S]*$/,
    /\n*\n*(?:改写说明|注意事项)[：:][\s\S]*$/,
  ];
  for (const suffix of suffixes) {
    cleaned = cleaned.replace(suffix, "");
  }

  return cleaned.trim();
}
