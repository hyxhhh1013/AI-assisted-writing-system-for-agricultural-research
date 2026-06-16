import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { appendChartAsset, patchProjectSection } from "@/services/project";

describe("plot project services", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes section content incrementally", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message: "保存成功" }),
    } as Response);

    await patchProjectSection("proj-1", "results", "hello");

    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/sections/results", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "hello" }),
    });
  });

  it("PATCHes charts with append op", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({
        charts: [
          {
            id: "c1",
            figureId: "bar_grouped",
            caption: "Fig 1",
            imageUrl: "/api/charts/x.png",
            createdAt: 1,
          },
        ],
      }),
    } as Response);

    const rows = await appendChartAsset("proj-1", {
      figureId: "bar_grouped",
      caption: "Fig 1",
      imageUrl: "/api/charts/x.png",
      sectionKey: "results",
    });

    expect(rows).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("/api/projects/proj-1/charts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ops: [
          {
            op: "append",
            asset: {
              figureId: "bar_grouped",
              caption: "Fig 1",
              imageUrl: "/api/charts/x.png",
              sectionKey: "results",
            },
          },
        ],
      }),
    });
  });
});
