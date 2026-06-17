import type { ReviewDetailResponse } from "@/contracts/review";
import type { PlagiarismCheckDetailRecord, PlagiarismCheckResult } from "@/contracts/plagiarism";
import { toCheckResult } from "@/services/plagiarism";
import { calculateDimensionScore } from "@/lib/review-scoring";
import type {
  FixableReviewReport,
  ReviewDimension,
  ReviewIssue,
  ReviewIssueType,
} from "@/types/review";

const DIMENSIONS: ReviewDimension[] = ["academic", "argument", "structure", "integrity"];

function toReviewIssue(row: ReviewDetailResponse["issues"][number]): ReviewIssue {
  return {
    id: row.id,
    dimension: row.dimension as ReviewDimension,
    type: row.type as ReviewIssueType,
    severity: row.severity as ReviewIssue["severity"],
    location: row.location,
    evidence: row.evidence,
    description: row.description,
    suggestion: row.suggestion,
    originalText: row.originalText ?? undefined,
  };
}

/** 从 DB 审查详情重建 UI 报告 */
export function buildFixableReportFromDetail(detail: ReviewDetailResponse): FixableReviewReport {
  const grouped: Record<ReviewDimension, ReviewIssue[]> = {
    academic: [],
    argument: [],
    structure: [],
    integrity: [],
  };

  for (const row of detail.issues) {
    const dim = row.dimension as ReviewDimension;
    if (grouped[dim]) grouped[dim].push(toReviewIssue(row));
  }

  const dimensions = {} as FixableReviewReport["dimensions"];
  for (const dim of DIMENSIONS) {
    dimensions[dim] = {
      ...calculateDimensionScore(dim, grouped[dim]),
      issues: grouped[dim].map((issue) => ({ ...issue, status: "open" as const })),
    };
  }

  const grade = detail.check.overallGrade as FixableReviewReport["overallGrade"] | null;

  return {
    reviewId: detail.check.id,
    projectId: detail.check.projectId ?? undefined,
    synopsis: detail.check.synopsis ?? "",
    summary: detail.check.summary ?? "",
    dimensions,
    overallScore: detail.check.overallScore ?? 0,
    overallGrade: grade ?? "C",
    createdAt: detail.check.createdAt,
  };
}

export interface RestoredPlagiarismSession {
  result: PlagiarismCheckResult;
  title: string;
  content: string;
}

export function buildRestoredPlagiarismSession(
  detail: PlagiarismCheckDetailRecord,
): RestoredPlagiarismSession {
  return {
    result: toCheckResult(detail),
    title: detail.title,
    content: detail.content ?? "",
  };
}
