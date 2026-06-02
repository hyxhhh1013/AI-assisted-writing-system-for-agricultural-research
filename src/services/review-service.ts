/**
 * 论文审查 Service
 *
 * 4 维度并行审查，生成结构化报告
 */

import prisma from "@/lib/prisma";
import { callAI, callAINonStreaming } from "@/lib/ai";
import { buildAcademicReviewPrompt } from "@/lib/prompts/review-academic";
import { buildArgumentReviewPrompt } from "@/lib/prompts/review-argument";
import { buildStructureReviewPrompt } from "@/lib/prompts/review-structure";
import { buildIntegrityReviewPrompt } from "@/lib/prompts/review-integrity";
import {
  calculateDimensionScore,
  generateReviewReport,
} from "@/lib/review-scoring";
import type {
  ReviewInput,
  ReviewConfig,
  ReviewReport,
  ReviewDimension,
  ReviewIssue,
  DimensionResult,
} from "@/types/review";

// ==================== 配置 ====================

const DEFAULT_CONFIG: Required<ReviewConfig> = {
  dimensions: ["academic", "argument", "structure", "integrity"],
  target: "",
  includeIntegrity: true,
};

// ==================== JSON 解析（三层容错）====================

/**
 * 解析 AI 返回的 JSON，三层容错
 */
function parseAIJson<T>(raw: string): T {
  // 1. 直接解析（AI 直接返回 JSON）
  try {
    return JSON.parse(raw) as T;
  } catch {}

  // 2. 提取 code fence 中的 JSON
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return JSON.parse(fenceMatch[1]) as T;
    } catch {}
  }

  // 3. 尝试找到第一个 { 到最后一个 } 之间的内容
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1)) as T;
    } catch {}
  }

  throw new Error("无法解析 AI 返回的 JSON");
}

// ==================== 单维度审查 ====================

interface AIReviewResponse {
  issues: Array<{
    id: string;
    type: string;
    severity: "high" | "medium" | "low";
    location: string;
    evidence: string;
    description: string;
    suggestion: string;
    originalText?: string;
  }>;
}

async function reviewDimension(
  dimension: ReviewDimension,
  content: string,
  fullContent: string,
  references?: string[],
  target?: string
): Promise<ReviewIssue[]> {
  let prompt: { system: string; user: string };

  switch (dimension) {
    case "academic":
      prompt = buildAcademicReviewPrompt(content, target);
      break;
    case "argument":
      prompt = buildArgumentReviewPrompt(content, target);
      break;
    case "structure":
      prompt = buildStructureReviewPrompt(content, undefined, target);
      break;
    case "integrity":
      prompt = buildIntegrityReviewPrompt(content, references, target);
      break;
    default:
      throw new Error(`未知维度: ${dimension}`);
  }

  const raw = await callAINonStreaming({
    provider: "deepseek",
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  });

  try {
    const response = parseAIJson<AIReviewResponse>(raw);

    // 标准化 issue 格式
    return (response.issues || []).map((issue, index) => ({
      id: `${dimension}_${index + 1}`,
      dimension,
      type: issue.type as ReviewIssue["type"],
      severity: issue.severity || "low",
      location: issue.location || "",
      evidence: issue.evidence || "",
      description: issue.description || "",
      suggestion: issue.suggestion || "",
      originalText: issue.originalText,
    }));
  } catch (err) {
    console.error(`[review] dimension=${dimension} parse failed:`, err);
    // 解析失败时返回空数组，不影响其他维度
    return [];
  }
}

// ==================== 主入口 ====================

/**
 * 执行论文审查
 */
export async function runReview(
  input: ReviewInput,
  config?: ReviewConfig
): Promise<ReviewReport> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };

  // 拼接全文内容（用于内容审查）
  const fullContent = input.sections
    .map((s) => `## ${s.title}\n\n${s.content}`)
    .join("\n\n");

  // 拼接带章节标记的内容（用于结构审查）
  const sectionedContent = input.sections
    .map((s) => `[${s.key}]\n${s.content}`)
    .join("\n\n");

  // 4 维度并行审查
  const dimensionPromises = mergedConfig.dimensions.map(async (dim) => {
    // 学术诚信维度可能需要参考文献列表
    const content = dim === "integrity" ? fullContent : sectionedContent;
    const issues = await reviewDimension(
      dim,
      content,
      fullContent,
      input.references,
      mergedConfig.target
    );
    return { dimension: dim, issues };
  });

  const dimensionResults = await Promise.all(dimensionPromises);

  // 计算各维度分数
  const dimensions = {} as Record<ReviewDimension, DimensionResult>;
  for (const { dimension, issues } of dimensionResults) {
    dimensions[dimension] = calculateDimensionScore(dimension, issues);
  }

  // 如果配置排除了某些维度，填充空结果
  for (const dim of ["academic", "argument", "structure", "integrity"] as ReviewDimension[]) {
    if (!dimensions[dim]) {
      dimensions[dim] = calculateDimensionScore(dim, []);
    }
  }

  // 生成报告
  const report = generateReviewReport(
    input.projectId,
    "", // synopsis 将由 AI 生成
    "", // summary 将由 AI 生成
    dimensions
  );

  // 生成概要和总体评价（可选，失败不影响报告）
  try {
    const summaryPrompt = buildSummaryPrompt(input.title, fullContent, dimensions);
    const summaryRaw = await callAINonStreaming({
      provider: "deepseek",
      messages: [
        { role: "system", content: "你是学术论文评审专家，用中文生成简洁的论文概要和总体评价。" },
        { role: "user", content: summaryPrompt },
      ],
    });

    const summaryResult = parseAIJson<{ synopsis: string; summary: string }>(summaryRaw);
    report.synopsis = summaryResult.synopsis || "";
    report.summary = summaryResult.summary || "";
  } catch (err) {
    console.error("[review] generate summary failed:", err);
    // 失败时使用默认描述
    report.synopsis = "论文概要生成失败";
    report.summary = "总体评价生成失败，请查看各维度详细结果。";
  }

  // 持久化
  try {
    await persistReview(report, input, fullContent);
  } catch (err) {
    console.error("[review] persist failed:", err);
  }

  return report;
}

// ==================== 摘要生成 Prompt ====================

function buildSummaryPrompt(
  title: string,
  content: string,
  dimensions: Record<ReviewDimension, DimensionResult>
): string {
  const dimensionSummary = Object.entries(dimensions)
    .map(([dim, result]) => {
      const dimNames: Record<string, string> = {
        academic: "学术规范",
        argument: "论证质量",
        structure: "结构规范",
        integrity: "学术诚信",
      };
      return `${dimNames[dim]}：${result.score}分（${result.grade}），${result.issueCount}个问题`;
    })
    .join("\n");

  return `请为以下论文生成简要的概要和总体评价。

论文题目：${title}

论文内容（节选）：
${content.slice(0, 3000)}...

各维度评分：
${dimensionSummary}

请严格按 JSON 格式输出：
{
  "synopsis": "论文概要（150字以内，说明研究目的、方法、主要发现）",
  "summary": "总体评价（3-5句，指出主要优点和需要改进的地方）"
}`;
}

// ==================== 持久化 ====================

async function persistReview(
  report: ReviewReport,
  input: ReviewInput,
  content: string
): Promise<void> {
  // 创建 ReviewCheck
  const check = await prisma.reviewCheck.create({
    data: {
      projectId: input.projectId || null,
      title: input.title,
      content,
      status: "done",
      overallScore: report.overallScore,
      overallGrade: report.overallGrade,
      summary: report.summary,
      synopsis: report.synopsis,
      dimensions: JSON.stringify({
        academic: report.dimensions.academic.score,
        argument: report.dimensions.argument.score,
        structure: report.dimensions.structure.score,
        integrity: report.dimensions.integrity.score,
      }),
    },
  });

  // 批量创建 ReviewIssue
  const allIssues: ReviewIssue[] = [];
  for (const dim of ["academic", "argument", "structure", "integrity"] as ReviewDimension[]) {
    allIssues.push(...report.dimensions[dim].issues);
  }

  if (allIssues.length > 0) {
    await prisma.reviewIssue.createMany({
      data: allIssues.map((issue) => ({
        checkId: check.id,
        dimension: issue.dimension,
        type: issue.type,
        severity: issue.severity,
        location: issue.location,
        evidence: issue.evidence,
        description: issue.description,
        suggestion: issue.suggestion,
        originalText: issue.originalText || null,
      })),
    });
  }

  // 更新 reportId
  report.reviewId = check.id;
}

// ==================== 历史记录 ====================

/**
 * 获取审查历史记录
 */
export async function getReviewHistory(
  projectId?: string
): Promise<Array<{
  id: string;
  projectId: string | null;
  title: string;
  overallScore: number | null;
  overallGrade: string | null;
  summary: string | null;
  synopsis: string | null;
  status: string;
  createdAt: Date;
}>> {
  const where = projectId ? { projectId } : {};
  return prisma.reviewCheck.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      projectId: true,
      title: true,
      overallScore: true,
      overallGrade: true,
      summary: true,
      synopsis: true,
      status: true,
      createdAt: true,
    },
  });
}

/**
 * 获取单条审查详情
 */
export async function getReviewDetail(
  checkId: string
): Promise<{
  check: NonNullable<Awaited<ReturnType<typeof prisma.reviewCheck.findUnique>>>;
  issues: Awaited<ReturnType<typeof prisma.reviewIssue.findMany>>;
} | null> {
  const check = await prisma.reviewCheck.findUnique({
    where: { id: checkId },
  });

  if (!check) return null;

  const issues = await prisma.reviewIssue.findMany({
    where: { checkId },
    orderBy: [
      { dimension: "asc" },
      { severity: "asc" },
    ],
  });

  return { check, issues };
}
