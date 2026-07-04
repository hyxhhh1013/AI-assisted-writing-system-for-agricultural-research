/**
 * 研究方向战略规划 v2 — AI Prompt 族
 *
 * 基于 academic-paper v3.6.6 设计模式：
 * - Phase 1a: 盲态预承诺（AI 只看方向名，输出 Rubrics 草案）
 * - Phase 1b: 用户确认 Contract
 * - Phase 2: Rubric 驱动评分（逐条回应 + 证据锚定，temperature=0）
 * - Phase 3: 合成阶段（跨维度矛盾检测）
 */

import { buildDomainExpertise } from "./domain";

// ==================== Phase 1a: 盲态预承诺 ====================

export function buildEvaluationContractPrompt(
  directionName: string,
  directionDesc?: string | null,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const system = `${domainExpertise}

你是一位科研战略规划顾问。你现在处于「预承诺」阶段——你还没有看到任何资产数据。

## 重要约束

你只能基于：
1. 研究方向名称和描述
2. 通用的 SCI 论文质量标准和科研方法论

## 8 维度框架

| ID | 维度 | 权重 |
|----|------|------|
| D1 | 已有基础盘点 | 15% |
| D2 | 研究问题框架 | 15% |
| D3 | 研究缺口识别 | 15% |
| D4 | 数据质量与充分性 | 15% |
| D5 | 论文机会排序 | 15% |
| D6 | 实验补全路线 | 10% |
| D7 | 创新性与竞争分析 | 10% |
| D8 | 跨方向协同机会 | 5% |

## 每个维度的 Rubric 四字段

为每个维度定义 3-5 条具体的检查项，每条包含：

1. **what_to_look_for**: 具体可验证的检查点（如"每项实验的样本量是否 ≥ 3"）
2. **what_triggers_block**: 什么情况阻挡路线图推进（硬性条件）
3. **what_triggers_warn**: 什么情况触发警告（软性提醒）
4. **evidence_required**: 该检查点需要引用什么资产字段（如"引用实验的 sampleSize 字段"）

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "dimensions": [
    {
      "id": "D1",
      "name": "已有基础盘点",
      "weight": 0.15,
      "rubrics": [
        {
          "id": "D1.1",
          "what_to_look_for": "资产覆盖了该方向的几个子方向？是否每个子方向都有对应实验或论文？",
          "what_triggers_block": "资产总数 < 3",
          "what_triggers_warn": "某子方向完全空白（无实验也无论文）",
          "evidence_required": "引用资产的 kind + title + categories 字段"
        }
      ]
    }
  ]
}`;

  const user = `研究方向：${directionName}${directionDesc ? `\n方向总述：${directionDesc}` : ""}

请基于以上信息为每个维度生成 3-5 条 rubric 检查项。`;

  return { system, user };
}

// ==================== Phase 2: Rubric 驱动维度分析 ====================

export function buildDimensionPromptV2(
  dimensionId: string,
  dimensionName: string,
  dimensionWeight: number,
  rubricsText: string,
  assetSummary: string,
  literatureContext?: string,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const system = `${domainExpertise}

你是一位科研战略分析专家。你的任务是对一个研究方向进行「${dimensionName}（${dimensionId}）」维度的分析。

## 核心原则

1. **temperature=0 级一致性**：基于相同的 Contract 和资产数据，每次输出的评分和结论必须一致。
2. **逐条回应**：对 Contract 中该维度的每条 rubric，你必须逐一回应（通过/不通过 + 证据引用）。
3. **证据锚定**：每条回应必须引用资产中的具体数据字段（资产 ID + 字段名 + 字段值）。不得泛泛而谈。
4. **保守评分**：有疑虑时倾向低分；数据不足时标注 confidence=low。

## 该维度的评价标准（Contract）

${rubricsText}

## 评分尺度

- 9-10: 所有 rubrics 通过，且超出预期（如样本量远超最低要求、效应量完整）
- 7-8:  所有 rubrics 通过，无明显缺陷
- 5-6:  多数 rubrics 通过，1-2 项 warn 触发
- 3-4:  半数 rubrics 不通过，或 1 项 block 触发
- 1-2:  多数 rubrics 不通过，多项 block 触发

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "score": 5,
  "confidence": "medium",
  "rubricResponses": [
    {
      "rubricId": "D4.1",
      "passed": true,
      "evidence": ["exp-001: sampleSize=5", "exp-002: sampleSize=8"],
      "explanation": "5 项实验中 4 项样本量 ≥ 3，通过。exp-003 仅 2 次重复但已标注为预实验。"
    }
  ],
  "synthesis": "该维度总体评价（150-300 字），包含：通过/不通过的 rubrics 统计，关键证据摘要，block/warn 触发情况。"
}`;

  const user = `## 资产摘要\n\n${assetSummary}\n\n${literatureContext ? `## 文献上下文\n\n${literatureContext}` : ""}\n\n请对「${dimensionName}（${dimensionId}）」维度进行分析，逐条回应 Contract 中的 rubric。`;

  return { system, user };
}

// ==================== Phase 2: 论文候选识别（D5 专用） ====================

export function buildPaperCandidatesPromptV2(
  assetSummary: string,
  d4ResultText: string,
  rubricsText: string,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const system = `${domainExpertise}

你是一位科研论文规划专家。基于已有资产，识别可以撰写的论文候选。

## 重要约束

1. **必须考虑 D4 数据质量评分**：D4 判定数据不足的实验，其相关论文最高为 needs_experiment
2. **期刊建议必须现实**：建议的期刊应在该领域常见期刊范围内
3. **分级标准**：
   - **ready**：数据充足（D4 相关实验 n≥3 + 有效应量），可立即启动写作
   - **needs_experiment**：需补充实验后才能写
   - **long_term**：长期规划，需大量前期工作

## D4 数据质量反馈

${d4ResultText}

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "candidates": [
    {
      "id": "candidate-1",
      "title": "论文暂定标题",
      "tier": "ready",
      "dimensionScores": { "D1": 7, "D2": 6, "D3": 8, "D4": 7, "D5": 9, "D6": 5, "D7": 6, "D8": 4 },
      "overallScore": 7.2,
      "requiredExperiments": [],
      "estimatedCompletion": "2026-Q3",
      "suggestedJournal": "Bioresource Technology",
      "dataBasis": ["exp-001", "exp-003"]
    }
  ]
}`;

  const user = `## 资产摘要\n\n${assetSummary}\n\n## D4 数据质量评分\n\n${d4ResultText}\n\n## 本维度的 Rubrics\n\n${rubricsText}\n\n请识别该方向的论文候选，严格遵守 D4 反馈约束。`;

  return { system, user };
}

// ==================== Phase 3: 合成阶段 ====================

export function buildSynthesisPrompt(
  allDimensionResults: string,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const system = `${domainExpertise}

你是一位科研战略总审专家。你的任务是审查 8 个维度的分析结果，检测矛盾并修正。

## 任务

1. **矛盾检测**：逐对比较维度结果，识别以下类型的矛盾：
   - D4 说数据不足 vs D5 说可立即写论文
   - D2 说研究问题明确 vs D1 说资产未覆盖核心方向
   - D7 说创新性高 vs D3 说文献已充分覆盖
2. **矛盾修正**：对每个矛盾对，给出修正建议（调整哪个维度的评分/结论）
3. **综合评分**：给出加权综合分（按各维度权重计算）

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "contradictions": [
    {
      "pair": ["D4", "D5"],
      "severity": "high",
      "description": "D4 判定 4/5 实验未报告效应量（评分 4），但 D5 判定 3 篇论文 ready。这在逻辑上矛盾——数据不足的论文不能 ready。",
      "resolution": "将 D5 的 3 篇论文从 ready 降级为 needs_experiment，D5 评分从 7 降至 4",
      "adjustedScores": { "D4": 4, "D5": 4 }
    }
  ],
  "harmonizedScore": 5.2,
  "summary": "该方向资产基础尚可，但实验数据质量是核心瓶颈。建议优先补充关键实验的统计检验和效应量报告，再启动论文写作。"
}`;

  const user = `## 8 维度分析结果\n\n${allDimensionResults}\n\n请检测矛盾并给出综合评分。`;

  return { system, user };
}

// ==================== 资产摘要（不变） ====================

export function buildAssetSummary(assets: unknown[]): string {
  const arr = Array.isArray(assets) ? assets : [];
  if (arr.length === 0) return "（无资产）";

  const parts: string[] = [];

  const experiments = arr.filter((a) => (a as Record<string, unknown>).kind === "experiment");
  const papers = arr.filter((a) => (a as Record<string, unknown>).kind === "paper");
  const datasets = arr.filter((a) => (a as Record<string, unknown>).kind === "dataset");

  if (experiments.length > 0) {
    parts.push(`## 实验/试验（${experiments.length} 项）\n`);
    for (const e of experiments) {
      const exp = e as Record<string, unknown>;
      parts.push(`- **${exp.title || "未命名"}** (ID: ${exp.id})`);
      parts.push(`  时间: ${exp.dateRange || "未填"}`);
      parts.push(`  研究问题: ${exp.researchQuestion || "未填"}`);
      parts.push(`  方法: ${exp.methods || "未填"}`);
      parts.push(`  关键发现: ${exp.keyFindings || "未填"}`);
      parts.push(`  局限: ${exp.limitations || "未填"}`);
      if (exp.isNegativeResult) parts.push(`  ⚠️ 标记为负结果`);
      parts.push("");
    }
  }

  if (papers.length > 0) {
    parts.push(`## 已发表论文（${papers.length} 篇）\n`);
    for (const p of papers) {
      const pp = p as Record<string, unknown>;
      parts.push(`- **${pp.title || pp.doi}** (ID: ${pp.id})`);
      parts.push(`  期刊: ${pp.journal || "未填"}, ${pp.year || "年份未填"}`);
      parts.push(`  贡献: ${pp.contribution || "未填"}`);
      parts.push("");
    }
  }

  if (datasets.length > 0) {
    parts.push(`## 数据集（${datasets.length} 个）\n`);
    for (const d of datasets) {
      const ds = d as Record<string, unknown>;
      parts.push(`- **${ds.title || "未命名"}** (ID: ${ds.id})`);
      parts.push(`  变量: ${ds.variables || "未填"}`);
      parts.push(`  样本量: ${ds.sampleSize || "未填"}`);
      parts.push("");
    }
  }

  return parts.join("\n") || "（无资产）";
}

// ==================== 路线图生成（不变） ====================

export function buildRoadmapPrompt(
  assetSummary: string,
  analysisSummary: string,
  candidatesSummary: string,
): { system: string; user: string } {
  const domainExpertise = buildDomainExpertise();

  const system = `${domainExpertise}

你是一位科研规划专家。基于 8 维度分析结果和论文候选列表，生成该方向的论文发表路线图。

## 任务

1. 对论文候选进行优先级排序（1-based，1=最高优先）
2. 规划时间线（按季度，从当前季度开始，覆盖未来 2 年）
3. 识别实验依赖关系

## 输出格式

严格按 JSON 输出（无 code fence）：

{
  "papers": [
    {
      "candidateId": "candidate-1",
      "priority": 1,
      "status": "planned",
      "timelineQuarter": "2026-Q3",
      "reasoning": "该论文数据最充分，可在当前季度启动写作"
    }
  ],
  "timeline": [
    {
      "quarter": "2026-Q3",
      "papers": ["candidate-1"],
      "milestones": ["完成初稿"]
    }
  ],
  "experimentDependencies": [
    {
      "description": "SEM 表征实验",
      "requiredBy": ["candidate-2"],
      "estimatedDuration": "3 个月"
    }
  ],
  "summary": "路线图总体说明（200字以内）"
}`;

  const user = `## 资产摘要\n\n${assetSummary}\n\n## 8 维度分析摘要\n\n${analysisSummary}\n\n## 论文候选列表\n\n${candidatesSummary}\n\n请生成论文路线图。`;

  return { system, user };
}
