/**
 * 论文审查 Service
 *
 * 4 维度并行审查，生成结构化报告
 */

import prisma from "@/lib/prisma";
import { callAINonStreaming } from "@/lib/ai";
import { buildAcademicReviewPrompt } from "@/lib/prompts/review-academic";
import { buildArgumentReviewPrompt } from "@/lib/prompts/review-argument";
import { buildStructureReviewPrompt } from "@/lib/prompts/review-structure";
import { buildIntegrityReviewPrompt } from "@/lib/prompts/review-integrity";
import {
  calculateDimensionScore,
  generateReviewReport,
  incompleteDimensionResult,
} from "@/lib/review-scoring";
import type {
  ReviewInput,
  ReviewConfig,
  ReviewReport,
  ReviewDimension,
  ReviewIssue,
  DimensionResult,
} from "@/contracts/review";

// ==================== 配置 ====================

const DEFAULT_CONFIG: Required<ReviewConfig> = {
  dimensions: ["academic", "argument", "structure", "integrity"],
  target: "",
  includeIntegrity: true,
  projectMode: "review",
};

/** 丢掉 undefined，避免可选字段把默认维度盖成空值后 `.map` 崩溃。 */
function definedConfig(config?: ReviewConfig): Partial<ReviewConfig> {
  if (!config) return {};
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== undefined),
  ) as Partial<ReviewConfig>;
}

// ==================== JSON 解析（三层容错）====================

/**
 * 解析 AI 返回的 JSON，三层容错
 */
function parseAIJson<T>(raw: string): T {
  const tryParse = (text: string): T => JSON.parse(text.replace(/,\s*([}\]])/g, "$1")) as T;

  // 1. 直接解析（AI 直接返回 JSON）
  try {
    return tryParse(raw);
  } catch {}

  // 2. 提取 code fence 中的 JSON
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    try {
      return tryParse(fenceMatch[1]);
    } catch {}
  }

  // 3. 尝试找到第一个 { 到最后一个 } 之间的内容
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    try {
      return tryParse(raw.slice(firstBrace, lastBrace + 1));
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
  target?: string,
  projectMode?: "review" | "research",
): Promise<{ issues: ReviewIssue[]; incomplete: boolean }> {
  let prompt: { system: string; user: string };

  switch (dimension) {
    case "academic":
      prompt = buildAcademicReviewPrompt(content, target);
      break;
    case "argument":
      prompt = buildArgumentReviewPrompt(content, target, projectMode);
      break;
    case "structure":
      prompt = buildStructureReviewPrompt(content, undefined, target);
      break;
    case "integrity":
      prompt = buildIntegrityReviewPrompt(content, references, target, projectMode);
      break;
    default:
      throw new Error(`未知维度: ${dimension}`);
  }

  const raw = await callAINonStreaming({
    provider: "zhipu",
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
  });

  try {
    const response = parseAIJson<AIReviewResponse>(raw);

    // 标准化 issue 格式
    return {
      incomplete: false,
      issues: (response.issues || []).map((issue, index) => ({
        id: `${dimension}_${index + 1}`,
        dimension,
        type: issue.type as ReviewIssue["type"],
        severity: issue.severity || "low",
        location: issue.location || "",
        evidence: issue.evidence || "",
        description: issue.description || "",
        suggestion: issue.suggestion || "",
        originalText: issue.originalText,
      })),
    };
  } catch (err) {
    console.error(`[review] dimension=${dimension} parse failed:`, err);
    console.error(
      `[review] dimension=${dimension} raw preview:`,
      raw.replace(/\s+/g, " ").slice(0, 160),
    );
    return { issues: [], incomplete: true };
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
  const mergedConfig: Required<ReviewConfig> = {
    ...DEFAULT_CONFIG,
    ...definedConfig(config),
    ...definedConfig(input.config),
  };
  const projectMode =
    input.projectMode ?? mergedConfig.projectMode ?? "review";

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
    const reviewed = await reviewDimension(
      dim,
      content,
      fullContent,
      input.references,
      mergedConfig.target,
      projectMode,
    );
    return { dimension: dim, ...reviewed };
  });

  const dimensionResults = await Promise.all(dimensionPromises);

  // 计算各维度分数。解析失败不计满分。
  const dimensions = {} as Record<ReviewDimension, DimensionResult>;
  for (const { dimension, issues, incomplete } of dimensionResults) {
    dimensions[dimension] = incomplete
      ? incompleteDimensionResult()
      : calculateDimensionScore(dimension, issues);
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
      provider: "zhipu",
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
      if (result.incomplete) return `${dimNames[dim]}：未完成，不计入综合分`;
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
        academic: report.dimensions.academic.incomplete ? { incomplete: true } : report.dimensions.academic.score,
        argument: report.dimensions.argument.incomplete ? { incomplete: true } : report.dimensions.argument.score,
        structure: report.dimensions.structure.incomplete ? { incomplete: true } : report.dimensions.structure.score,
        integrity: report.dimensions.integrity.incomplete ? { incomplete: true } : report.dimensions.integrity.score,
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
