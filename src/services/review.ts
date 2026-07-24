/**
 * 论文审查 API 客户端封装（UI → /api/review/*）
 * 服务端算法见 review-service.ts
 */

import type {
  ReviewFixIssueRequest,
  ReviewDetailResponse,
  ReviewHistoryItem,
  RunReviewRequest,
} from "@/contracts/review";
import type {
  ReviewApiResponse,
  ReviewDimension,
  ReviewInput,
  ReviewReport,
} from "@/contracts/review";

export type {
  ReviewFixIssueRequest,
  ReviewDetailRecord,
  ReviewDetailIssueRecord,
  ReviewDetailResponse,
  ReviewHistoryItem,
  RunReviewRequest,
} from "@/contracts/review";

export type {
  FixableReviewIssue,
  FixableReviewReport,
  IssueStatus,
  ReviewDimension,
  ReviewInput,
  ReviewIssue,
  ReviewReport,
} from "@/contracts/review";

function parseReviewError(data: { error?: string; success?: boolean }, fallback: string): string {
  if (data.error) return data.error;
  if (data.success === false) return fallback;
  return fallback;
}

/** POST /api/review — 执行多维度审查 */
export async function runReview(
  input: ReviewInput,
  dimensions?: ReviewDimension[],
): Promise<ReviewReport> {
  const res = await fetch("/api/review", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...input,
      dimensions,
    }),
  });

  const data = (await res.json().catch(() => ({}))) as ReviewApiResponse;
  if (!res.ok || !data.success || !data.report) {
    throw new Error(parseReviewError(data, "审查失败"));
  }
  return data.report;
}

/** POST /api/review/rounds — 下一轮审查（max 2） */
export async function runReviewRound(input: {
  projectId: string;
  title: string;
  sections: Array<{ key: string; content: string }>;
  outline?: string;
  projectMode?: "review" | "research";
  force?: boolean;
}): Promise<import("@/contracts/review-rounds").ReviewRoundResult> {
  const res = await fetch("/api/review/rounds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    error?: string;
  } & Partial<import("@/contracts/review-rounds").ReviewRoundResult>;

  if (!res.ok || data.success === false) {
    throw new Error(data.error || "审查编排失败");
  }
  return data as import("@/contracts/review-rounds").ReviewRoundResult;
}

/** GET /api/review/rounds?projectId= */
export async function getReviewRoundStatusClient(
  projectId: string,
): Promise<import("@/contracts/review-rounds").ReviewRoundStatus> {
  const res = await fetch(`/api/review/rounds?projectId=${encodeURIComponent(projectId)}`);
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    status?: import("@/contracts/review-rounds").ReviewRoundStatus;
    error?: string;
  };
  if (!res.ok || !data.success || !data.status) {
    throw new Error(data.error || "获取审查轮次失败");
  }
  return data.status;
}

/** GET /api/review/history — 审查历史列表 */
export async function getHistory(projectId?: string): Promise<ReviewHistoryItem[]> {
  const params = new URLSearchParams();
  if (projectId) params.set("projectId", projectId);

  const query = params.toString();
  const res = await fetch(`/api/review/history${query ? `?${query}` : ""}`);
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    history?: ReviewHistoryItem[];
    error?: string;
  };

  if (!res.ok || data.success === false) {
    throw new Error(parseReviewError(data, "获取审查历史失败"));
  }

  return (data.history ?? []).map((item) => ({
    ...item,
    createdAt: typeof item.createdAt === "string"
      ? item.createdAt
      : new Date(item.createdAt as unknown as string).toISOString(),
  }));
}

/** GET /api/review/[id] — 单条审查详情 */
export async function getDetail(reviewId: string): Promise<ReviewDetailResponse> {
  const res = await fetch(`/api/review/${encodeURIComponent(reviewId)}`);
  const data = (await res.json().catch(() => ({}))) as {
    success?: boolean;
    check?: ReviewDetailResponse["check"];
    issues?: ReviewDetailResponse["issues"];
    error?: string;
  };

  if (!res.ok || data.success === false || !data.check) {
    throw new Error(parseReviewError(data, "获取审查详情失败"));
  }

  return {
    check: {
      ...data.check,
      createdAt: typeof data.check.createdAt === "string"
        ? data.check.createdAt
        : new Date(data.check.createdAt as unknown as string).toISOString(),
    },
    issues: data.issues ?? [],
  };
}

/**
 * 修复单个问题。
 * UI-PR-042 将接入 AI 修复 API；当前返回 suggestion 作为占位。
 */
export async function fixIssue(request: ReviewFixIssueRequest): Promise<string | null> {
  void request.sectionContents;
  void request.title;
  void request.dimension;
  void request.issueIndex;
  return request.suggestion || request.originalText || null;
}

/** PATCH /api/projects/[id]/sections/[key] — 增量写入单个章节 */
export async function patchSection(
  projectId: string,
  sectionKey: string,
  content: string,
): Promise<void> {
  const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/sections/${encodeURIComponent(sectionKey)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(data.error || "保存章节失败");
  }
}

/** 将 RunReviewRequest 转为 ReviewInput（供 hook 使用） */
export function toReviewInput(request: RunReviewRequest): ReviewInput {
  return {
    projectId: request.projectId,
    title: request.title,
    sections: request.sections,
    outline: request.outline,
    references: request.references,
    config: request.target || request.dimensions
      ? {
          target: request.target,
          dimensions: request.dimensions,
        }
      : undefined,
  };
}
