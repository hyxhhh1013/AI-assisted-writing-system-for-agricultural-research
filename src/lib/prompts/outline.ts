import { buildDomainExpertise } from "./domain";
import type { ProjectWritingMode } from "@/contracts/writing-mode";

function buildResearchOutlinePrompt(params: {
  title: string;
  researchDirection: string;
  language: string;
  contextText: string;
}): string {
  const { title, researchDirection, language, contextText } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);

  return `${domainExpertise}
请根据论文题目和研究方向，结合提供的参考资料，生成一份专业且详细的**原创研究论文**大纲。

【论文类型】原创试验/机理/方法研究（IMRaD 结构）

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
}): string {
  const { title, researchDirection, language, contextText } = params;
  const domainExpertise = buildDomainExpertise(researchDirection);

  return `${domainExpertise}
请根据题目和研究方向，结合参考资料，生成一份**文献综述**大纲（非原创试验论文）。

【论文类型】文献综述 — 按主题/机制/应用维度综合已有研究，禁止安排「材料与方法」「试验设计」「本研究数据」等原创实验章节。

【叙事逻辑】为何此时重要 → 概念与问题框架 → 主题1 → 主题2 → … → 争议与空白 → 综合判断 → 展望

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

【写作要求】：
1. 「研究进展综述」下至少 3 个主题子节，子节名应体现分类逻辑而非试验步骤
2. 禁止出现「材料与方法」「结果与分析」「试验设计」「样本量」等 IMRaD 试验章节
3. 每个子标题后 1-3 句要点，说明该节要综合哪些类型的文献
4. 仅输出大纲本身
5. 严禁 *** 或 --- 装饰线

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
}): string {
  if (params.projectMode === "research") {
    return buildResearchOutlinePrompt(params);
  }
  return buildReviewOutlinePrompt(params);
}
