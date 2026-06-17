import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  checkPlagiarism,
  getCheckDetail,
  listHistory,
  rewriteMatch,
  toCheckResult,
} from "@/services/plagiarism";

describe("plagiarism service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("checkPlagiarism posts to /api/plagiarism/v2", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        checkId: "chk-1",
        totalMatches: 1,
        maxSimilarity: 0.2,
        overallRisk: "low",
        matches: [],
      }),
    } as Response);

    const result = await checkPlagiarism({
      title: "测试",
      content: "一段足够长的正文内容用于查重检测。",
    });

    expect(result.checkId).toBe("chk-1");
    expect(fetch).toHaveBeenCalledWith("/api/plagiarism/v2", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "测试",
        content: "一段足够长的正文内容用于查重检测。",
      }),
    });
  });

  it("listHistory returns checks array", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ checks: [{ id: "chk-1", title: "A", maxSimilarity: 0.1, overallRisk: "low", createdAt: "2026-01-01" }] }),
    } as Response);

    const checks = await listHistory({ projectId: "proj-1" });
    expect(checks).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("/api/plagiarism/history?projectId=proj-1");
  });

  it("getCheckDetail maps to CheckResult via toCheckResult", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        check: {
          id: "chk-1",
          title: "A",
          status: "completed",
          maxSimilarity: 0.42,
          overallRisk: "high",
          createdAt: "2026-01-01",
          matches: [{
            id: "m1",
            sourceText: "原文",
            sourceOffset: 0,
            matchType: "self",
            matchedText: "匹配",
            matchedFrom: "self",
            similarity: 0.42,
            riskLevel: "high",
          }],
          _count: { matches: 1 },
        },
      }),
    } as Response);

    const detail = await getCheckDetail("chk-1");
    const result = toCheckResult(detail);
    expect(result.checkId).toBe("chk-1");
    expect(result.totalMatches).toBe(1);
    expect(result.matches[0]?.matchType).toBe("self");
  });

  it("rewriteMatch returns suggestions", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ suggestions: [{ strategy: "rephrase", suggestedText: "改写后" }] }),
    } as Response);

    const suggestions = await rewriteMatch({
      checkId: "chk-1",
      matchId: "m1",
      originalText: "原文",
    });
    expect(suggestions[0]?.suggestedText).toBe("改写后");
  });
});
