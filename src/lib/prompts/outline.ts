import { buildDomainExpertise } from "./domain";
import type { ProjectWritingMode } from "@/contracts/writing-mode";

function buildSkeletonConstraint(userSkeleton: string[]): string {
  const lines = userSkeleton.map((heading, index) => `${index + 1}. ${heading}`).join("\n");
  return `
【用户给定的一级章节骨架】—— 必须严格遵守（硬约束）：
- 一级章节 ## 标题必须**逐字**使用下列名称，不得改写、翻译或替换为同义章节名
- 禁止新增或删除一级章节；顺序必须与下列一致
- 禁止把任一一级标题改成「材料与方法」「结果与分析」「Results」「Methods」等未列出的名称
- 仅可在每个一级章节下补充 ### 子节与 1–3 句要点说明

${lines}
`;
}

function buildResearchOutlinePrompt(params: {
  title: string;
  researchDirection: string;
  language: string;
  contextText: string;
  userSkeleton?: string[];
}): string {
  const { title, researchDirection, language, contextText, userSkeleton } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);
  const skeletonBlock = userSkeleton?.length
    ? buildSkeletonConstraint(userSkeleton)
    : "";

  return `${domainExpertise}
请根据论文题目和研究方向，结合提供的参考资料，生成一份专业且详细的**原创研究论文**大纲。

【论文类型】原创试验/机理/方法研究（IMRaD 结构）
${skeletonBlock || `
【大纲结构要求】—— 必须包含以下全部章节：
## 摘要 — 1-2句该章节的核心方向
## 引言
  ### 研究背景与意义
  ### 国内外研究现状
  ### 现有研究的不足
  ### 本研究目标与内容
## 材料与方法
  ### 试验材料与设计
  ### 测定指标与方法
  ### 数据处理与统计分析
## 结果与分析
  ### [具体结果主题1]
  ### [具体结果主题2]
  ### 主要发现及可能机制
  ### 与已有研究的比较
  ### 研究局限
## 结论
  ### 主要结论
  ### 创新点（在证据范围内陈述）
  ### 展望
`}

【写作要求】：
1. 每个标题独占一行，用 Markdown ##/###/####
2. 每个子标题后 1-3 句要点说明
3. 术语准确，符合农业学科规范
4. 深度参考提供的文献库内容
5. 仅输出大纲本身
6. 严禁使用 *** 或 --- 装饰线

【输出语言】：${language === "en" ? "英文 (English)" : "中文 (Chinese)"}

【参考资料】：
${contextText}

论文题目：${title}
研究方向：${researchDirection}`;
}

function buildReviewOutlinePrompt(params: {
  title: string;
  researchDirection: string;
  language: string;
  contextText: string;
  userSkeleton?: string[];
}): string {
  const { title, researchDirection, language, contextText, userSkeleton } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);
  const skeletonBlock = userSkeleton?.length
    ? buildSkeletonConstraint(userSkeleton)
    : "";

  return `${domainExpertise}
请根据题目和研究方向，结合参考资料，生成一份**文献综述**大纲（非原创试验论文）。

【论文类型】文献综述 — 按主题/机制/应用维度综合已有研究，禁止安排「材料与方法」「试验设计」「本研究数据」等原创实验章节。

【叙事逻辑】为何此时重要 → 概念与问题框架 → 主题1 → 主题2 → … → 争议与空白 → 综合判断 → 展望
${skeletonBlock || `
【大纲结构要求】—— 必须包含：
## 摘要 — 综述范围、主要共识、空白与展望方向
## 引言
  ### 领域背景与综述必要性
  ### 研究总体脉络（概括）
  ### 现有综述或研究的不足
  ### 本文综述范围与结构安排
## 研究现状与问题
  ### 核心概念与分类框架
  ### 研究分布与主要问题
  ### 不同研究路线或观点分野
## 研究进展综述
  ### [主题维度1 — 如机理/材料/工艺等]
  ### [主题维度2]
  ### [主题维度3]
  ### 方法学或尺度差异（如适用）
  ### 主要争议与不一致结论
## 结论与展望
  ### 综合性结论（3-5条）
  ### 知识空白与未来研究方向
  ### 应用或政策启示（如有文献支撑）
`}

【写作要求】：
1. 「研究进展综述」或用户骨架中的主体章下至少 3 个主题子节，子节名应体现分类逻辑而非试验步骤
2. **硬性禁止**一级或二级标题出现：「材料与方法」「结果与分析」「结果与讨论」「试验设计」「样本量」「Materials and Methods」——即使用户未写进骨架也禁止
3. 每个子标题后 1-3 句要点，说明该节要综合哪些类型的文献
4. 仅输出大纲本身
5. 严禁 *** 或 --- 装饰线
6. 若骨架含「研究现状与问题」，对应 ## 标题必须写「研究现状与问题」，不得改成方法/结果类标题

【输出语言】：${language === "en" ? "英文 (English)" : "中文 (Chinese)"}

【参考资料】：
${contextText}

论文题目：${title}
研究方向：${researchDirection}`;
}

export function buildOutlinePrompt(params: {
  title: string;
  researchDirection: string;
  language: string;
  contextText: string;
  projectMode?: ProjectWritingMode;
  userSkeleton?: string[];
}): string {
  if (params.projectMode === "research") {
    return buildResearchOutlinePrompt(params);
  }
  return buildReviewOutlinePrompt(params);
}
