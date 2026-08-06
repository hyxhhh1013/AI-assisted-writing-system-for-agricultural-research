import { describe, expect, it, vi, beforeEach } from "vitest";
import { buildToolConfirmMessage } from "@/lib/agent/confirm-message";
import { searchExternalTool } from "@/lib/agent/tools/search-external";
import { shouldRequestConfirmation } from "@/lib/agent/core/safety";
import { importReferenceTool } from "@/lib/agent/tools/import-reference";
import type { AgentContext } from "@/lib/agent/types";

vi.mock("@/lib/literature-search", () => ({
  searchExternalLiterature: vi.fn(async () => [
    {
      id: "doi:10.1234/abc",
      title: "Drought stress in maize",
      authors: ["Li, B.", "Wang, C."],
      year: 2024,
      journal: "Plant Sci",
      volume: "12",
      pages: "1-10",
      doi: "10.1234/abc",
      abstract: "A very long abstract ".repeat(40),
      source: "openalex",
    },
  ]),
  searchExternalLiteratureWithStats: vi.fn(async () => ({
    hits: [
      {
        id: "doi:10.1234/abc",
        title: "Drought stress in maize",
        authors: ["Li, B.", "Wang, C."],
        year: 2024,
        journal: "Plant Sci",
        volume: "12",
        pages: "1-10",
        doi: "10.1234/abc",
        abstract: "A very long abstract ".repeat(40),
        source: "openalex",
      },
    ],
    variants: ["maize drought"],
    sourceCounts: { openalex: 1, "semantic-scholar": 0, crossref: 0, pubmed: 0 },
  })),
}));

const baseCtx: AgentContext = {
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

describe("agent literature bridge (P1)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("search_external is the canonical tool name and returns hitJson + relevance", async () => {
    expect(searchExternalTool.name).toBe("search_external");
    const result = await searchExternalTool.execute({ query: "maize drought" }, baseCtx);
    expect(result.success).toBe(true);
    const data = result.data as {
      items: {
        index: number;
        hitJson: string;
        title: string;
        relevanceScore: number;
        why: string;
      }[];
      suggestedCount: number;
    };
    expect(data.items).toHaveLength(1);
    expect(data.items[0]?.index).toBe(1);
    expect(data.items[0]?.title).toMatch(/Drought/);
    expect(data.items[0]?.relevanceScore).toBeGreaterThan(0);
    expect(data.items[0]?.why).toMatch(/命中|DOI|相关/);
    const hit = JSON.parse(data.items[0]!.hitJson) as { title: string; abstract?: string };
    expect(hit.title).toMatch(/Drought/);
    // 保留摘要供入库 soft-grounded / 知识库摘要索引
    expect(hit.abstract).toBeTruthy();
    expect(data.suggestedCount).toBeGreaterThanOrEqual(1);
  });

  it("import_reference is gated by shouldRequestConfirmation", () => {
    expect(shouldRequestConfirmation(importReferenceTool)).toBe(true);
  });

  it("buildToolConfirmMessage shows citation preview from hitJson", () => {
    const hitJson = JSON.stringify({
      id: "doi:10.1234/abc",
      title: "Drought stress in maize",
      authors: ["Li, B."],
      year: 2024,
      journal: "Plant Sci",
      doi: "10.1234/abc",
      source: "openalex",
    });
    const { message, preview } = buildToolConfirmMessage("import_reference", { hitJson });
    expect(message).toMatch(/Drought stress/);
    expect(preview).toMatch(/Plant Sci/);
    expect(preview).toMatch(/10\.1234\/abc/);
  });
});
