import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { patchAnalysisResults } from "@/services/project";

describe("patchAnalysisResults", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /api/projects/:id/analysis-results with ops", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        analysisResults: [{ id: "a1", content: "Summary text" }],
      }),
    } as Response);

    const rows = await patchAnalysisResults("proj-1", [
      { op: "create", content: "New analysis" },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("a1");
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/analysis-results", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ops: [{ op: "create", content: "New analysis" }],
      }),
    });
  });
});
