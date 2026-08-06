/**
 * W3-REVIEW-2 — 审查多轮编排（max 2）
 */

import type { ReviewReport, ReviewIssue } from "@/contracts/review";

export const REVIEW_MAX_ROUNDS = 2 as const;

export interface ReviewRoundStatus {
  projectId: string;
  doneCount: number;
  maxRounds: typeof REVIEW_MAX_ROUNDS;
  remaining: number;
  complete: boolean;
  lastCheckId: string | null;
  lastScore: number | null;
  lastGrade: string | null;
}

export interface ReviewRoundResult {
  status: ReviewRoundStatus;
  /** 本轮是否新跑了审查；已达上限时为 false */
  ran: boolean;
  round: number;
  report: ReviewReport | null;
  /** 供 Agent / UI 展示的下一动作 */
  nextHint: string;
  topIssues: Array<Pick<ReviewIssue, "id" | "dimension" | "severity" | "description" | "suggestion">>;
}

export function buildReviewRoundHint(status: ReviewRoundStatus, highMediumCount: number): string {
  if (status.complete) {
    return "已完成 2 轮审查，Passport Phase 7 可标完成；可进入导出前总检";
  }
  if (status.doneCount === 0) {
    return "尚未审查：请运行第 1 轮四维审查";
  }
  if (highMediumCount > 0) {
    return `第 ${status.doneCount} 轮仍有 ${highMediumCount} 条中高严重度问题：请先按意见改稿，再跑第 ${status.doneCount + 1} 轮`;
  }
  return `第 ${status.doneCount} 轮问题较少：可直接运行第 ${status.doneCount + 1} 轮确认`;
}
