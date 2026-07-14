import { describe, expect, it, vi, beforeEach } from "vitest";
import { importReferenceTool } from "@/lib/agent/tools/import-reference";
import { checkPlagiarismTool } from "@/lib/agent/tools/check-plagiarism";
import { generateChartTool } from "@/lib/agent/tools/generate-chart";
import type { AgentContext } from "@/lib/agent/types";

vi.mock("@/lib/chart-runner", () => ({
  AGENT_CHART_TYPES: ["line"],
  isAgentChartType: (v: string) => v === "line",
  runChartGeneration: vi.fn(async () => ({
    imageUrl: "/api/charts/test.png",
    svgUrl: "/api/charts/test.svg",
    fileName: "test.png",
    baseName: "test",
  })),
}));

vi.mock("@/lib/agent/chart-persist", () => ({
  persistAgentChart: vi.fn(async () => ({
    id: "chart-1",
    figureId: "line",
    caption: "Test",
    imageUrl: "/api/charts/test.png",
    createdAt: Date.now(),
  })),
}));

vi.mock("@/lib/agent/import-reference", () => ({
  importExternalReferenceToProject: vi.fn(async () => ({
    citation: "[1] Test Paper. Journal. 2024.",
    referenceCount: 3,
  })),
}));

vi.mock("@/lib/literature-search", () => ({
  searchExternalLiterature: vi.fn(async () => []),
}));

vi.mock("@/services/plagiarism-service", () => ({
  runPlagiarismCheck: vi.fn(async () => ({
    checkId: "chk-1",
    totalMatches: 2,
    maxSimilarity: 0.42,
    overallRisk: "medium",
    matches: [],
    stats: {
      totalParagraphs: 5,
      sampledParagraphs: 5,
      selfMatches: 1,
      crossMatches: 0,
      knowledgeMatches: 1,
      embeddingMatches: 0,
      webMatches: 0,
      clicheMatches: 0,
      aiMatches: 0,
      processingTime: 100,
    },
  })),
}));

const baseCtx: AgentContext = {
  userId: "user-1",
  projectId: "proj-1",
  signal: new AbortController().signal,
  budget: {
    maxIterations: 5,
    currentIteration: 0,
    maxToolCalls: 10,
    toolCallCount: 0,
  },
};

const sampleHit = {
  id: "doi:10.1234/test",
  title: "Biochar soil amendment",
  authors: ["Zhang, A."],
  year: 2023,
  journal: "Soil Biology",
  source: "openalex" as const,
};

describe("agent tools wave2", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("import_reference returns preview when userConfirmed is false", async () => {
    const result = await importReferenceTool.execute(
      { hitJson: JSON.stringify(sampleHit), userConfirmed: false },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ requiresConfirmation: true });
    expect(result.summary).toMatch(/待确认/);
  });

  it("import_reference imports when userConfirmed is true", async () => {
    const result = await importReferenceTool.execute(
      { hitJson: JSON.stringify(sampleHit), userConfirmed: true },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ referenceCount: 3 });
  });

  it("check_plagiarism runs service and summarizes risk", async () => {
    const result = await checkPlagiarismTool.execute(
      { content: "这是一段待查重的正文。" },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.summary).toMatch(/medium/);
  });

  it("generate_chart returns image url and persists by default", async () => {
    const result = await generateChartTool.execute(
      {
        chartType: "line",
        csvData: "X,Y\n1,2\n2,4",
        title: "趋势图",
      },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ imageUrl: "/api/charts/test.png" });
    expect(result.summary).toMatch(/登记/);
  });
});
