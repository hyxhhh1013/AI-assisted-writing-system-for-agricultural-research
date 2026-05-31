/**
 * 论文审查契约 — 与 @/types/review 对齐，并补充 API 层类型
 */

export type {
  AcademicIssueType,
  ArgumentIssueType,
  DimensionResult,
  FixableReviewIssue,
  FixableReviewReport,
  FixIssueApiResponse,
  IntegrityIssueType,
  ReviewApiResponse,
  ReviewConfig,
  ReviewDimension,
  ReviewInput,
  ReviewIssue,
  ReviewIssueType,
  ReviewReport,
  StructureIssueType,
} from "@/types/review";

export interface ReviewHistoryItem {
  id: string;
  projectId: string | null;
  title: string;
  overallScore: number | null;
  overallGrade: string | null;
  summary: string | null;
  synopsis: string | null;
  status: string;
  createdAt: string;
}

export interface ReviewDetailRecord {
  id: string;
  projectId: string | null;
  title: string;
  overallScore: number | null;
  overallGrade: string | null;
  summary: string | null;
  synopsis: string | null;
  status: string;
  createdAt: string;
  dimensionScores?: string | null;
}

export interface ReviewDetailIssueRecord {
  id: string;
  checkId: string;
  dimension: string;
  type: string;
  severity: string;
  location: string;
  evidence: string;
  description: string;
  suggestion: string;
  originalText: string | null;
  status?: string | null;
}

export interface ReviewDetailResponse {
  check: ReviewDetailRecord;
  issues: ReviewDetailIssueRecord[];
}

export interface RunReviewRequest {
  projectId?: string;
  title: string;
  sections: Array<{
    key: string;
    title: string;
    content: string;
  }>;
  outline?: string;
  references?: string[];
  dimensions?: import("@/types/review").ReviewDimension[];
  target?: string;
}

export interface ReviewFixIssueRequest {
  dimension: import("@/types/review").ReviewDimension;
  issueIndex: number;
  sectionContents: Record<string, string>;
  title: string;
  suggestion: string;
  originalText?: string;
}
