import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildImportReferenceConfirmParams,
  resolveImportReferenceCandidates,
  resolveRequestedHits,
} from "@/lib/agent/import-confirm";
import {
  storeLastAgentSearch,
  clearLastAgentSearch,
} from "@/lib/agent/last-search";
import { importReferenceTool } from "@/lib/agent/tools/import-reference";
import type { AgentContext } from "@/lib/agent/types";

vi.mock("@/lib/literature-search", () => ({
  searchExternalLiterature: vi.fn(async () => []),
}));

vi.mock("@/lib/agent/import-reference", () => ({
  importExternalReferenceToProject: vi.fn(async () => ({
    citation: "[1] Test Paper. Journal. 2024.",
    referenceCount: 3,
  })),
  importExternalReferencesToProject: vi.fn(async () => ({
    imported: 2,
    skippedDuplicate: 0,
    skippedNonCitable: 0,
    citations: ["a", "b"],
    referenceCount: 5,
    withAbstract: 1,
  })),
}));

const ctx: AgentContext = {
  userId: "u1",
  projectId: "p1",
  signal: new AbortController().signal,
  budget: {
    maxIterations: 5,
    currentIteration: 0,
    maxToolCalls: 10,
    toolCallCount: 0,
  },
};

function hit(id: string, title: string) {
  return {
    id,
    title,
    authors: [] as string[],
    year: 2023,
    journal: "Soil Biology",
    source: "openalex" as const,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  clearLastAgentSearch(ctx.userId);
  vi.stubGlobal("fetch", vi.fn(async () => {
    throw new Error("offline");
  }));
});

describe("resolveRequestedHits", () => {
  it("resolves hitIndices from last-search store", async () => {
    storeLastAgentSearch(ctx.userId, [hit("doi:1", "A"), hit("doi:2", "B")]);
    const hits = await resolveRequestedHits({ hitIndices: "[2]" }, ctx);
    expect(hits.map((h) => h.id)).toEqual(["doi:2"]);
  });

  it("parses hitsJson", async () => {
    const hits = await resolveRequestedHits(
      { hitsJson: JSON.stringify([hit("doi:1", "A"), hit("doi:2", "B")]) },
      ctx,
    );
    expect(hits.length).toBe(2);
  });

  it("parses single hitJson", async () => {
    const hits = await resolveRequestedHits(
      { hitJson: JSON.stringify(hit("doi:9", "Z")) },
      ctx,
    );
    expect(hits.map((h) => h.id)).toEqual(["doi:9"]);
  });

  it("hitIndices preferred over hitJson when both present", async () => {
    storeLastAgentSearch(ctx.userId, [hit("doi:1", "A")]);
    const hits = await resolveRequestedHits(
      { hitIndices: "1", hitJson: JSON.stringify(hit("doi:9", "Z")) },
      ctx,
    );
    expect(hits.map((h) => h.id)).toEqual(["doi:1"]);
  });
});

describe("resolveImportReferenceCandidates", () => {
  it("unions requested hits with full store and dedups by id", async () => {
    storeLastAgentSearch(ctx.userId, [hit("doi:1", "A"), hit("doi:3", "C")]);
    const items = await resolveImportReferenceCandidates({ hitIndices: "[1]" }, ctx);
    expect(items.map((h) => h.id)).toEqual(["doi:1", "doi:3"]);
  });

  it("dedups when requested hit also in store", async () => {
    storeLastAgentSearch(ctx.userId, [hit("doi:1", "A"), hit("doi:2", "B")]);
    const items = await resolveImportReferenceCandidates(
      { hitsJson: JSON.stringify([hit("doi:2", "B")]) },
      ctx,
    );
    expect(items.map((h) => h.id)).toEqual(["doi:2", "doi:1"]);
  });

  it("模型传单篇 hitJson 时，确认卡仍列出 store 全部候选（收集到的很多）", async () => {
    // 复现生产：search_external 收集 5 篇 → 模型单篇 hitJson 调用 import_reference
    storeLastAgentSearch(ctx.userId, [
      hit("doi:1", "A"),
      hit("doi:2", "B"),
      hit("doi:3", "C"),
      hit("doi:4", "D"),
      hit("doi:5", "E"),
    ]);
    const items = await resolveImportReferenceCandidates(
      { hitJson: JSON.stringify(hit("doi:9", "模型另传的一篇")) },
      ctx,
    );
    expect(items.length).toBeGreaterThan(1);
    expect(items.map((h) => h.id)).toContain("doi:9");
    expect(items.map((h) => h.id)).toContain("doi:1");
  });

  it("returns empty when no requested hits and no store", async () => {
    const items = await resolveImportReferenceCandidates({ hitJson: "not-json" }, ctx);
    expect(items).toEqual([]);
  });
});

describe("buildImportReferenceConfirmParams", () => {
  it("injects importItems and keeps enrichment", async () => {
    storeLastAgentSearch(ctx.userId, [hit("doi:1", "A")]);
    const p = await buildImportReferenceConfirmParams(
      { hitIndices: "[1]", query: "biochar", why: "与生物炭改良土壤课题直接相关，需要引用" },
      ctx,
    );
    expect(Array.isArray(p.importItems)).toBe(true);
    expect((p.importItems as unknown[]).length).toBe(1);
    expect(p.query).toBe("biochar");
    expect(p.why).toBe("与生物炭改良土壤课题直接相关，需要引用");
    const first = (p.importItems as { why?: string; topicFit?: string }[])[0];
    expect(first?.why).toMatch(/命中|未命中|DOI/);
    expect(first?.topicFit === "aligned" || first?.topicFit === "marginal").toBe(true);
  });

  it("标题命中课题词标对口，只在摘要命中标边缘", async () => {
    storeLastAgentSearch(ctx.userId, [
      {
        ...hit("doi:1", "Biochar amendment improves soil"),
        abstract: "A field study.",
      },
      {
        ...hit("doi:2", "Unrelated catalysis review"),
        abstract: "Mentions biochar only in the abstract body.",
      },
    ]);
    const p = await buildImportReferenceConfirmParams(
      { hitIndices: "[1]", query: "biochar soil" },
      ctx,
    );
    const items = p.importItems as { id: string; topicFit?: string; why?: string }[];
    expect(items.find((x) => x.id === "doi:1")?.topicFit).toBe("aligned");
    expect(items.find((x) => x.id === "doi:2")?.topicFit).toBe("marginal");
    expect(items.find((x) => x.id === "doi:2")?.why).toMatch(/biochar/);
  });

  it("补摘要失败时确认卡仍列出这篇，不带摘要", async () => {
    storeLastAgentSearch(ctx.userId, [{
      ...hit("doi:10.1000/excerpt", "Soil study"),
      doi: "10.1000/excerpt",
    }]);
    const p = await buildImportReferenceConfirmParams(
      { hitIndices: "[1]", query: "biochar" },
      ctx,
    );
    const first = (p.importItems as { title?: string; abstract?: string }[])[0];
    expect(first?.title).toBe("Soil study");
    expect(first?.abstract).toBeUndefined();
  });

  it("no importItems when nothing resolved", async () => {
    const p = await buildImportReferenceConfirmParams({ hitJson: "not-json" }, ctx);
    expect(p.importItems).toBeUndefined();
  });
});

describe("importReferenceTool selectedIndices batch path", () => {
  it("imports all selected hits without relevance gate", async () => {
    const { importExternalReferencesToProject } = await import("@/lib/agent/import-reference");
    const result = await importReferenceTool.execute(
      {
        importItems: [hit("doi:1", "A"), hit("doi:2", "B")],
        selectedIndices: [0, 1],
        userConfirmed: true,
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(importExternalReferencesToProject).toHaveBeenCalledTimes(1);
    expect(importExternalReferencesToProject).toHaveBeenCalledWith(
      ctx.userId,
      ctx.projectId,
      [hit("doi:1", "A"), hit("doi:2", "B")],
      expect.anything(),
      expect.anything(),
    );
    expect(result.data).toMatchObject({ batch: true, imported: 2 });
  });

  it("imports only the picked subset", async () => {
    const { importExternalReferencesToProject } = await import("@/lib/agent/import-reference");
    const result = await importReferenceTool.execute(
      {
        importItems: [hit("doi:1", "A"), hit("doi:2", "B")],
        selectedIndices: [1],
        userConfirmed: true,
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(importExternalReferencesToProject).toHaveBeenCalledWith(
      ctx.userId,
      ctx.projectId,
      [hit("doi:2", "B")],
      expect.anything(),
      expect.anything(),
    );
  });

  it("rejects when importItems present but nothing selected", async () => {
    const result = await importReferenceTool.execute(
      {
        importItems: [hit("doi:1", "A")],
        selectedIndices: [],
        userConfirmed: true,
      },
      ctx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/未勾选/);
  });

  it("defaults to all importItems when selectedIndices omitted", async () => {
    const { importExternalReferencesToProject } = await import("@/lib/agent/import-reference");
    const items = [hit("doi:1", "A"), hit("doi:2", "B")];
    const result = await importReferenceTool.execute(
      {
        importItems: items,
        userConfirmed: true,
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(importExternalReferencesToProject).toHaveBeenCalledWith(
      ctx.userId,
      ctx.projectId,
      items,
      expect.anything(),
      expect.anything(),
    );
  });

  it("ignores out-of-range indices and imports valid ones", async () => {
    const { importExternalReferencesToProject } = await import("@/lib/agent/import-reference");
    const result = await importReferenceTool.execute(
      {
        importItems: [hit("doi:1", "A")],
        selectedIndices: [0, 5],
        userConfirmed: true,
      },
      ctx,
    );
    expect(result.success).toBe(true);
    expect(importExternalReferencesToProject).toHaveBeenCalledWith(
      ctx.userId,
      ctx.projectId,
      [hit("doi:1", "A")],
      expect.anything(),
      expect.anything(),
    );
  });

  it("emits agent/progress per paper while batch importing", async () => {
    const { importExternalReferencesToProject } = await import("@/lib/agent/import-reference");
    vi.mocked(importExternalReferencesToProject).mockImplementationOnce(
      async (_u, _p, _h, _b, onProgress) => {
        onProgress?.(1, 2, "第一篇");
        onProgress?.(2, 2, "第二篇");
        return {
          imported: 2,
          skippedDuplicate: 0,
          skippedNonCitable: 0,
          citations: ["a", "b"],
          referenceCount: 2,
          withAbstract: 0,
        };
      },
    );
    const emitted: unknown[] = [];
    const ctxWithEmit = {
      ...ctx,
      emitLiveEvent: (e: unknown) => emitted.push(e),
    };
    const result = await importReferenceTool.execute(
      {
        importItems: [hit("doi:1", "A"), hit("doi:2", "B")],
        selectedIndices: [0, 1],
        userConfirmed: true,
      },
      ctxWithEmit as AgentContext,
    );
    expect(result.success).toBe(true);
    const progress = emitted.filter(
      (e) => (e as { type?: string }).type === "agent/progress",
    );
    expect(progress.length).toBe(2);
    expect(progress[0]).toMatchObject({ stage: "importing", done: 1, total: 2 });
    expect(progress[1]).toMatchObject({ stage: "importing", done: 2, total: 2, detail: "第二篇" });
  });
});
