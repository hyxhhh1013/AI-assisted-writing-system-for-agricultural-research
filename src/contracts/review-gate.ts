/** Phase 6 审查轮次与 Phase 7 导出门禁（对齐 academic-paper） */

export const MAX_REVIEW_ROUNDS = 2;

export type ReviewRoundGateCode = "MAX_ROUNDS";

export type ReviewRoundGateResult =
  | { ok: true; doneCount: number; remaining: number }
  | {
      ok: false;
      doneCount: number;
      remaining: 0;
      code: ReviewRoundGateCode;
      reason: string;
    };

export type ExportGateCode = "NO_REVIEW" | "OPEN_CRITICAL";

export type ExportGateResult =
  | { ok: true }
  | {
      ok: false;
      code: ExportGateCode;
      reason: string;
      openHighIssueCount?: number;
    };

export interface ReviewGateState {
  doneCount: number;
  openHighIssueCount: number;
  latestCheckId: string | null;
}

/** 是否允许再发起一轮审查（最多 MAX_REVIEW_ROUNDS） */
export function evaluateReviewRoundGate(doneCount: number): ReviewRoundGateResult {
  if (doneCount >= MAX_REVIEW_ROUNDS) {
    return {
      ok: false,
      doneCount,
      remaining: 0,
      code: "MAX_ROUNDS",
      reason: `已完成 ${MAX_REVIEW_ROUNDS} 轮审查（上限）。未解决问题请记入「已知局限」后导出，或先处理 Critical 项。`,
    };
  }
  return {
    ok: true,
    doneCount,
    remaining: MAX_REVIEW_ROUNDS - doneCount,
  };
}

/**
 * 导出门禁：至少完成 1 轮审查，且最新一轮无未关闭的 high（Critical）问题。
 */
export function evaluateExportGate(input: {
  reviewDoneCount: number;
  openHighIssueCount: number;
}): ExportGateResult {
  if (input.reviewDoneCount < 1) {
    return {
      ok: false,
      code: "NO_REVIEW",
      reason: "请先完成至少 1 轮论文审查，再导出成稿。",
    };
  }
  if (input.openHighIssueCount > 0) {
    return {
      ok: false,
      code: "OPEN_CRITICAL",
      reason: `仍有 ${input.openHighIssueCount} 条高严重度（Critical）问题未处理，请修复、忽略或完成第 2 轮审查后再导出。`,
      openHighIssueCount: input.openHighIssueCount,
    };
  }
  return { ok: true };
}
