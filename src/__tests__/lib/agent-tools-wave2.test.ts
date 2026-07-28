import { describe, expect, it, vi, beforeEach } from "vitest";
import { importReferenceTool } from "@/lib/agent/tools/import-reference";
import { checkPlagiarismTool } from "@/lib/agent/tools/check-plagiarism";
import { generateChartTool } from "@/lib/agent/tools/generate-chart";
import { generateXrdAnalysisTool } from "@/lib/agent/tools/generate-xrd-analysis";
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

vi.mock("@/lib/xrd-scherrer-runner", () => ({
  runScherrerGeneration: vi.fn(async () => ({
    imageUrl: "/api/charts/scherrer.png",
    imageBase64: "data:image/png;base64,abc",
    data: {
      wavelength: 1.5406,
      shape_factor: 0.9,
      fwhm_unit: "degree",
      n_peaks: 1,
      mean_size_nm: 12.3,
      peaks: [
        { label: "Peak1", two_theta: 28.4, fwhm: 0.25, size_nm: 12.3 },
      ],
    },
  })),
}));

vi.mock("@/lib/agent/project-persist", () => ({
  appendAgentSectionMarkdown: vi.fn(async (_u, _p, sectionKey: string) => ({
    sectionKey,
  })),
}));

vi.mock("@/lib/agent/import-reference", () => ({
  importExternalReferenceToProject: vi.fn(async () => ({
    citation: "[1] Test Paper. Journal. 2024.",
    referenceCount: 3,
  })),
  importExternalReferencesToProject: vi.fn(async () => ({
    imported: 2,
    skippedDuplicate: 0,
    citations: ["a", "b"],
    referenceCount: 5,
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
      {
        hitJson: JSON.stringify(sampleHit),
        query: "biochar soil",
        why: "与生物炭改良土壤课题直接相关",
        userConfirmed: false,
      },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ requiresConfirmation: true });
    expect(result.summary).toMatch(/待确认/);
  });

  it("import_reference imports when userConfirmed is true", async () => {
    const result = await importReferenceTool.execute(
      {
        hitJson: JSON.stringify(sampleHit),
        query: "biochar soil",
        why: "与生物炭改良土壤课题直接相关",
        userConfirmed: true,
      },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ referenceCount: 3, persisted: true });
  });

  it("import_reference rejects low relevance without why", async () => {
    const result = await importReferenceTool.execute(
      {
        hitJson: JSON.stringify(sampleHit),
        query: "quantum entanglement qubit superconducting",
        userConfirmed: true,
      },
      baseCtx,
    );
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/相关度/);
  });

  it("import_reference requires confirmation at tool definition", () => {
    expect(importReferenceTool.requiresConfirmation).toBe(true);
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
    expect(result.data).toMatchObject({
      imageUrl: "/api/charts/test.png",
      hasReplay: true,
    });
    expect(result.summary).toMatch(/登记/);
  });

  it("generate_chart inserts into section when sectionKey set", async () => {
    const { appendAgentSectionMarkdown } = await import("@/lib/agent/project-persist");
    const result = await generateChartTool.execute(
      {
        chartType: "line",
        csvData: "X,Y\n1,2\n2,4",
        title: "结果图",
        sectionKey: "results",
      },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ insertedSection: "results" });
    expect(appendAgentSectionMarkdown).toHaveBeenCalled();
    expect(result.summary).toMatch(/插入章节/);
  });

  it("generate_xrd_analysis workflow_link returns plot href", async () => {
    const result = await generateXrdAnalysisTool.execute(
      { action: "workflow_link" },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      href: expect.stringContaining("figure=xrd_workflow"),
    });
  });

  it("generate_xrd_analysis scherrer persists and inserts section", async () => {
    const { appendAgentSectionMarkdown } = await import("@/lib/agent/project-persist");
    const peaks = JSON.stringify([{ two_theta: 28.4, fwhm: 0.25, label: "(111)" }]);
    const result = await generateXrdAnalysisTool.execute(
      {
        action: "scherrer",
        peaksJson: peaks,
        title: "Scherrer 分析",
        sectionKey: "results",
      },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      imageUrl: "/api/charts/scherrer.png",
      insertedSection: "results",
      meanSizeNm: 12.3,
    });
    expect(appendAgentSectionMarkdown).toHaveBeenCalled();
    expect(result.summary).toMatch(/nm/);
  });

  it("import_reference batch preview with hitsJson", async () => {
    const hits = [
      {
        id: "doi:10.1/a",
        title: "Biochar soil A",
        authors: ["A"],
        year: 2023,
        source: "openalex",
      },
      {
        id: "doi:10.1/b",
        title: "Biochar soil B",
        authors: ["B"],
        year: 2022,
        source: "openalex",
      },
    ];
    const result = await importReferenceTool.execute(
      {
        hitsJson: JSON.stringify(hits),
        query: "biochar soil",
        why: "与生物炭改良土壤课题直接相关，用于结果对比",
        userConfirmed: false,
      },
      baseCtx,
    );
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      requiresConfirmation: true,
      batch: true,
      count: 2,
    });
  });
});
