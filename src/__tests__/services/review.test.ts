import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { fixIssue, getDetail, getHistory, runReview } from "@/services/review";

describe("review service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("runReview posts to /api/review and returns report", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        report: {
          reviewId: "rev-1",
          synopsis: "概要",
          summary: "总结",
          overallScore: 80,
          overallGrade: "B",
          createdAt: "2026-01-01",
          dimensions: {
            academic: { score: 80, grade: "B", issueCount: 0, breakdown: { high: 0, medium: 0, low: 0 }, basis: [], issues: [] },
            argument: { score: 80, grade: "B", issueCount: 0, breakdown: { high: 0, medium: 0, low: 0 }, basis: [], issues: [] },
            structure: { score: 80, grade: "B", issueCount: 0, breakdown: { high: 0, medium: 0, low: 0 }, basis: [], issues: [] },
            integrity: { score: 80, grade: "B", issueCount: 0, breakdown: { high: 0, medium: 0, low: 0 }, basis: [], issues: [] },
          },
        },
      }),
    } as Response);

    const report = await runReview({
      title: "测试论文",
      sections: [{ key: "introduction", title: "引言", content: "正文内容足够长。" }],
    });

    expect(report.reviewId).toBe("rev-1");
    expect(fetch).toHaveBeenCalledWith("/api/review", expect.objectContaining({ method: "POST" }));
  });

  it("getHistory returns history items", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        history: [{
          id: "rev-1",
          projectId: "p1",
          title: "A",
          overallScore: 75,
          overallGrade: "B",
          summary: "s",
          synopsis: "syn",
          status: "completed",
          createdAt: "2026-01-01T00:00:00.000Z",
        }],
      }),
    } as Response);

    const history = await getHistory("p1");
    expect(history).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("/api/review/history?projectId=p1");
  });

  it("getDetail returns check and issues", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        check: {
          id: "rev-1",
          projectId: "p1",
          title: "A",
          overallScore: 75,
          overallGrade: "B",
          summary: "s",
          synopsis: "syn",
          status: "completed",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        issues: [],
      }),
    } as Response);

    const detail = await getDetail("rev-1");
    expect(detail.check.id).toBe("rev-1");
  });

  it("fixIssue returns suggestion placeholder", async () => {
    const result = await fixIssue({
      dimension: "academic",
      issueIndex: 0,
      sectionContents: { introduction: "原文" },
      title: "论文",
      suggestion: "建议改写",
    });
    expect(result).toBe("建议改写");
  });
});
