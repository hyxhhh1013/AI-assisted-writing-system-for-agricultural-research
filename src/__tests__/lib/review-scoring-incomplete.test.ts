import { describe, expect, it } from "vitest";
import {
  calculateDimensionScore,
  calculateOverallScore,
  incompleteDimensionResult,
} from "@/lib/review-scoring";
import type { ReviewIssue } from "@/contracts/review";

function issue(severity: ReviewIssue["severity"], index: number): ReviewIssue {
  return {
    id: `s${index}`,
    dimension: "structure",
    type: "section",
    severity,
    location: "结构",
    evidence: "缺少章节",
    description: "结构不完整",
    suggestion: "补齐",
  };
}

describe("incomplete review dimensions", () => {
  it("scores only the dimensions that actually finished", () => {
    const structure = calculateDimensionScore("structure", [
      ...Array.from({ length: 5 }, (_, index) => issue("high", index)),
      issue("medium", 5),
    ]);
    expect(structure.score).toBe(17);

    const overall = calculateOverallScore({
      academic: incompleteDimensionResult(),
      argument: incompleteDimensionResult(),
      structure,
      integrity: incompleteDimensionResult(),
    });

    expect(overall.score).toBe(17);
    expect(overall.grade).toBe("D");
  });
});
