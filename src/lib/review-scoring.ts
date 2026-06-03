/**
 * 论文审查评分算法
 *
 * 基于问题数量和严重程度计算维度分数和综合分数
 */

import type {
  ReviewIssue,
  ReviewDimension,
  DimensionResult,
  ReviewReport,
} from "@/types/review";

// ==================== 评分权重 ====================

/**
 * 各维度权重（总和 = 1）
 * 论证质量和学术诚信权重最高
 */
const DIMENSION_WEIGHTS: Record<ReviewDimension, number> = {
  academic: 0.25,
  argument: 0.35,
  structure: 0.15,
  integrity: 0.25,
};

// ==================== 扣分规则 ====================

/**
 * 各严重程度的扣分值
 */
const SEVERITY_PENALTY: Record<string, number> = {
  high: 15,
  medium: 8,
  low: 3,
};

// ==================== 等级划分 ====================

function getGrade(score: number): "A" | "B" | "C" | "D" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  return "D";
}

// ==================== 维度评分 ====================

/**
 * 计算单个维度的分数
 *
 * 评分逻辑：
 * - 基础分 100
 * - high: -15 分/个
 * - medium: -8 分/个
 * - low: -3 分/个
 * - 最低 0 分
 */
export function calculateDimensionScore(
  dimension: ReviewDimension,
  issues: ReviewIssue[]
): DimensionResult {
  // 统计各严重程度问题数
  const breakdown = {
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const issue of issues) {
    if (issue.severity === "high") breakdown.high++;
    else if (issue.severity === "medium") breakdown.medium++;
    else if (issue.severity === "low") breakdown.low++;
  }

  // 计算扣分
  const deduction =
    breakdown.high * SEVERITY_PENALTY.high +
    breakdown.medium * SEVERITY_PENALTY.medium +
    breakdown.low * SEVERITY_PENALTY.low;

  // 计算分数（最低 0 分）
  const score = Math.max(0, 100 - deduction);
  const grade = getGrade(score);

  // 生成打分依据
  const basis: string[] = [];
  if (breakdown.high > 0) {
    basis.push(`${breakdown.high} 个高严重度问题，共扣 ${breakdown.high * SEVERITY_PENALTY.high} 分`);
  }
  if (breakdown.medium > 0) {
    basis.push(`${breakdown.medium} 个中严重度问题，共扣 ${breakdown.medium * SEVERITY_PENALTY.medium} 分`);
  }
  if (breakdown.low > 0) {
    basis.push(`${breakdown.low} 个低严重度问题，共扣 ${breakdown.low * SEVERITY_PENALTY.low} 分`);
  }
  if (issues.length === 0) {
    basis.push("未发现问题，满分通过");
  }

  return {
    score,
    grade,
    issueCount: issues.length,
    breakdown,
    basis,
    issues,
  };
}

// ==================== 综合评分 ====================

/**
 * 计算综合分数（加权平均）
 */
export function calculateOverallScore(
  dimensions: Record<ReviewDimension, DimensionResult>
): {
  score: number;
  grade: "A" | "B" | "C" | "D";
} {
  let weightedSum = 0;

  for (const [dim, weight] of Object.entries(DIMENSION_WEIGHTS)) {
    const dimension = dim as ReviewDimension;
    weightedSum += dimensions[dimension].score * weight;
  }

  const score = Math.round(weightedSum);
  const grade = getGrade(score);

  return { score, grade };
}

// ==================== 生成报告 ====================

/**
 * 生成完整的审查报告
 */
export function generateReviewReport(
  projectId: string | undefined,
  synopsis: string,
  summary: string,
  dimensions: Record<ReviewDimension, DimensionResult>,
  createdAt: string = new Date().toISOString()
): ReviewReport {
  const { score: overallScore, grade: overallGrade } = calculateOverallScore(dimensions);

  return {
    reviewId: `review_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    projectId,
    synopsis,
    summary,
    dimensions,
    overallScore,
    overallGrade,
    createdAt,
  };
}

// ==================== 工具函数 ====================

/**
 * 从维度结果中提取摘要信息
 */
export function extractDimensionSummary(
  dimensions: Record<ReviewDimension, DimensionResult>
): {
  totalIssues: number;
  highIssues: number;
  mediumIssues: number;
  lowIssues: number;
  dimensionScores: Record<ReviewDimension, number>;
} {
  let totalIssues = 0;
  let highIssues = 0;
  let mediumIssues = 0;
  let lowIssues = 0;
  const dimensionScores = {} as Record<ReviewDimension, number>;

  for (const [dim, result] of Object.entries(dimensions)) {
    const dimension = dim as ReviewDimension;
    totalIssues += result.issueCount;
    highIssues += result.breakdown.high;
    mediumIssues += result.breakdown.medium;
    lowIssues += result.breakdown.low;
    dimensionScores[dimension] = result.score;
  }

  return {
    totalIssues,
    highIssues,
    mediumIssues,
    lowIssues,
    dimensionScores,
  };
}

/**
 * 获取维度名称（中文）
 */
export function getDimensionName(dimension: ReviewDimension): string {
  const names: Record<ReviewDimension, string> = {
    academic: "学术规范",
    argument: "论证质量",
    structure: "结构规范",
    integrity: "学术诚信",
  };
  return names[dimension];
}

/**
 * 获取维度图标
 */
export function getDimensionIcon(dimension: ReviewDimension): string {
  const icons: Record<ReviewDimension, string> = {
    academic: "📝",
    argument: "💡",
    structure: "🏗️",
    integrity: "🔒",
  };
  return icons[dimension];
}
