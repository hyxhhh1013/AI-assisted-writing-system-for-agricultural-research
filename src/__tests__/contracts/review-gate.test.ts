import { describe, expect, it } from "vitest";
import {
  MAX_REVIEW_ROUNDS,
  evaluateExportGate,
  evaluateReviewRoundGate,
} from "@/contracts/review-gate";

describe("evaluateReviewRoundGate", () => {
  it("allows first and second round", () => {
    expect(evaluateReviewRoundGate(0).ok).toBe(true);
    expect(evaluateReviewRoundGate(1).ok).toBe(true);
    if (evaluateReviewRoundGate(1).ok) {
      expect(evaluateReviewRoundGate(1).remaining).toBe(1);
    }
  });

  it("blocks at max rounds", () => {
    const r = evaluateReviewRoundGate(MAX_REVIEW_ROUNDS);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("MAX_ROUNDS");
  });
});

describe("evaluateExportGate", () => {
  it("requires at least one review", () => {
    const r = evaluateExportGate({ reviewDoneCount: 0, openHighIssueCount: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("NO_REVIEW");
  });

  it("blocks open critical issues", () => {
    const r = evaluateExportGate({ reviewDoneCount: 1, openHighIssueCount: 2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("OPEN_CRITICAL");
  });

  it("allows export when reviewed and no open high", () => {
    expect(
      evaluateExportGate({ reviewDoneCount: 1, openHighIssueCount: 0 }).ok,
    ).toBe(true);
  });
});
