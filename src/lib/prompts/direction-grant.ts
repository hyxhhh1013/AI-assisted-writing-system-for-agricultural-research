/**
 * 研究方向 — 基金申请书生成 Prompt
 *
 * 将方向全景（资产 + 分析 + 路线图）组装为结构化基金申请书
 */

import { buildDomainExpertise } from "./domain";

export interface GrantGenerationInput {
  directionName: string;
  directionDesc?: string | null;
  assetSummary: string;
  analysisSummary: string;
  roadmapSummary: string;
  grantType: string; // "国自然面上" | "国自然青年" | "省基金" | "开放课题"
  literatureContext?: string;
}

const SECTION_TEMPLATES: Record<string, string[]> = {
  "国自然面上": [
    "立项依据与研究意义", "国内外研究现状", "研究内容", "研究目标",
    "关键科学问题", "技术路线", "可行性分析", "创新点",
    "研究基础与条件", "预期成果", "经费概算",
  ],
  "国自然青年": [
    "立项依据", "研究内容", "研究目标", "技术路线",
    "创新点", "研究基础", "预期成果",
  ],
  "省基金": [
    "研究意义", "研究现状", "研究内容", "技术路线",
    "创新点", "研究基础", "预期成果", "经费预算",
  ],
  "开放课题": [
    "研究背景与意义", "研究内容", "技术路线",
    "研究基础", "预期成果", "经费预算",
  ],
};

export function buildGrantProposalPrompt(
  input: GrantGenerationInput,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();
  const sections = SECTION_TEMPLATES[input.grantType] || SECTION_TEMPLATES["国自然面上"];

  const sectionGuide = sections
    .map((s, i) => `${i + 1}. **${s}**: 根据已有数据填充`)
    .join("\n");

  const system = `${domainExpertise}

你是一位科研基金申请书撰写专家。你的任务是基于实验室已有研究基础和分析结果，撰写一份${input.grantType}申请书。

## 数据映射规则

| 申请书章节 | 数据来源 |
|-----------|----------|
| 立项依据 / 研究意义 | 方向描述 + D3 缺口分析 |
| 国内外研究现状 | D1 已有基础 + 知识库文献 |
| 研究内容 | PaperCandidate 列表（按 Tier 分级） |
| 研究目标 | 路线图中的总体目标 |
| 技术路线 | 路线图时间线 + 实验方案 |
| 可行性分析 | D4 数据质量 + D7 创新性 |
| 创新点 | D7 维度摘要 |
| 研究基础 | 已发表论文列表 + 实验资产 |
| 预期成果 | 路线图中的论文/专利规划 |
| 经费概算 | 实验方案中的设备/耗材 |

## 重要约束

1. **实事求是**：只基于已有数据撰写，不要虚构未做的实验或未发表的论文
2. **适度拔高**：在真实基础上，用学术语言包装研究意义和创新性
3. **引用具体数据**：能引用具体论文时引用具体论文
4. **标注不确定性**：数据不足的部分标注"（基于方向分析建议）"

## 需要撰写的章节

${sectionGuide}

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "title": "项目名称（25字以内）",
  "sections": [
    {
      "heading": "章节标题",
      "content": "章节内容（Markdown 格式，300-800 字）"
    }
  ]
}`;

  const user = `项目类型：${input.grantType}
研究方向：${input.directionName}${input.directionDesc ? `\n方向描述：${input.directionDesc}` : ""}

## 资产摘要
${input.assetSummary}

## 8 维度分析摘要
${input.analysisSummary}

## 论文路线图摘要
${input.roadmapSummary}
${input.literatureContext ? `\n## 知识库文献片段（用于国内外研究现状）\n${input.literatureContext}` : ""}

请撰写申请书。`;

  return { system, user };
}
