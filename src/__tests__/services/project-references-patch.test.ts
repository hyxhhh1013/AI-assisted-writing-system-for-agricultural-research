import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { patchReferences } from "@/services/project";

describe("patchReferences", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /api/projects/:id/references with ops", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        references: [{ id: "r1", content: "A", order: 0 }],
      }),
    } as Response);

    const refs = await patchReferences("proj-1", [
      { op: "create", content: "New ref", index: 0 },
    ]);

    expect(refs).toHaveLength(1);
    expect(refs[0].id).toBe("r1");
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/references", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ops: [{ op: "create", content: "New ref", index: 0 }],
      }),
    });
  });
});
