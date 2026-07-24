import { describe, expect, it } from "vitest";
import {
  REVIEW_MAX_ROUNDS,
  buildReviewRoundHint,
  type ReviewRoundStatus,
} from "@/contracts/review-rounds";

function status(partial: Partial<ReviewRoundStatus>): ReviewRoundStatus {
  return {
    projectId: "p1",
    doneCount: 0,
    maxRounds: REVIEW_MAX_ROUNDS,
    remaining: REVIEW_MAX_ROUNDS,
    complete: false,
    lastCheckId: null,
    lastScore: null,
    lastGrade: null,
    ...partial,
  };
}

describe("buildReviewRoundHint", () => {
  it("prompts first round when none done", () => {
    expect(buildReviewRoundHint(status({ doneCount: 0, remaining: 2 }), 0)).toContain(
      "第 1 轮",
    );
  });

  it("asks to fix then rerun when high/medium remain", () => {
    const hint = buildReviewRoundHint(
      status({ doneCount: 1, remaining: 1, complete: false }),
      3,
    );
    expect(hint).toContain("3 条");
    expect(hint).toContain("第 2 轮");
  });

  it("allows confirmation round when issues are light", () => {
    expect(
      buildReviewRoundHint(status({ doneCount: 1, remaining: 1 }), 0),
    ).toContain("第 2 轮确认");
  });

  it("marks complete after 2 rounds", () => {
    expect(
      buildReviewRoundHint(
        status({ doneCount: 2, remaining: 0, complete: true }),
        0,
      ),
    ).toContain("已完成 2 轮");
  });
});

describe("REVIEW_MAX_ROUNDS", () => {
  it("is capped at 2", () => {
    expect(REVIEW_MAX_ROUNDS).toBe(2);
  });
});
