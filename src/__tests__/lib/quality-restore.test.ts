import { describe, it, expect } from "vitest";
import { buildFixableReportFromDetail, buildRestoredPlagiarismSession } from "@/lib/quality-state";
import type { ReviewDetailResponse } from "@/contracts/review";
import type { PlagiarismCheckDetailRecord } from "@/contracts/plagiarism";

describe("quality-restore", () => {
  it("buildFixableReportFromDetail groups issues by dimension", () => {
    const detail: ReviewDetailResponse = {
      check: {
        id: "rev-1",
        projectId: "proj-1",
        title: "测试论文",
        overallScore: 82,
        overallGrade: "B",
        summary: "总体良好",
        synopsis: "研究概要",
        status: "done",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
      issues: [
        {
          id: "i1",
          checkId: "rev-1",
          dimension: "academic",
          type: "slang",
          severity: "medium",
          location: "引言",
          evidence: "原文",
          description: "口语化",
          suggestion: "改为书面语",
          originalText: "很好",
        },
      ],
    };

    const report = buildFixableReportFromDetail(detail);
    expect(report.reviewId).toBe("rev-1");
    expect(report.overallScore).toBe(82);
    expect(report.dimensions.academic.issues).toHaveLength(1);
    expect(report.dimensions.academic.issues[0].status).toBe("open");
  });

  it("buildRestoredPlagiarismSession maps detail to result and content", () => {
    const detail: PlagiarismCheckDetailRecord = {
      id: "chk-1",
      title: "章节查重",
      content: "正文内容",
      status: "completed",
      maxSimilarity: 0.2,
      overallRisk: "low",
      createdAt: "2026-06-01T00:00:00.000Z",
      matches: [],
      _count: { matches: 0 },
    };

    const session = buildRestoredPlagiarismSession(detail);
    expect(session.result.checkId).toBe("chk-1");
    expect(session.content).toBe("正文内容");
    expect(session.title).toBe("章节查重");
  });
});
