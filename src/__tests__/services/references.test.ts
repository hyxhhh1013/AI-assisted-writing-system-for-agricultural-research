import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { formatFilenames, listByProject, batchUpsertReferences } from "@/services/references";

describe("references service", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("formatFilenames returns empty map for empty input", async () => {
    await expect(formatFilenames([])).resolves.toEqual({});
    expect(fetch).not.toHaveBeenCalled();
  });

  it("formatFilenames calls format API and returns formatted map", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ formatted: { "a.pdf": "[1] Author. Title[J]. 2020." } }),
    } as Response);

    const result = await formatFilenames(["a.pdf"]);
    expect(result).toEqual({ "a.pdf": "[1] Author. Title[J]. 2020." });
    expect(fetch).toHaveBeenCalledWith(
      "/api/references?format=true&filenames=a.pdf",
    );
  });

  it("listByProject throws on failed response", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      json: async () => ({ error: "缺少 projectId" }),
    } as Response);

    await expect(listByProject("proj-1")).rejects.toThrow("缺少 projectId");
  });

  it("listReferenceSources is alias of listByProject", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ id: "1", projectId: "p1", refIndex: 1, sourceName: "a.pdf", category: "", citation: "", createdAt: "" }],
    } as Response);

    const { listReferenceSources } = await import("@/services/references");
    const rows = await listReferenceSources("p1");
    expect(rows).toHaveLength(1);
    expect(fetch).toHaveBeenCalledWith("/api/references?projectId=p1");
  });

  it("batchUpsertReferences posts mappings payload", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ message: "ok" }),
    } as Response);

    await batchUpsertReferences({
      projectId: "proj-1",
      mappings: [{ refIndex: 1, sourceName: "paper.pdf" }],
    });

    expect(fetch).toHaveBeenCalledWith("/api/references?batch=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "proj-1",
        mappings: [{ refIndex: 1, sourceName: "paper.pdf" }],
      }),
    });
  });
});
