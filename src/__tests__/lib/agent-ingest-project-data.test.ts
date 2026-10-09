import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";
import {
  mergeIngestedClaims,
  mergeIngestedSources,
  normalizeIngestSourceId,
} from "@/lib/agent/ingest-project-data";
import { ingestProjectDataTool } from "@/lib/agent/tools/ingest-project-data";
import type { AgentContext } from "@/lib/agent/types";

const findProject = vi.fn();
const updateProject = vi.fn();
const findAttachment = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    project: {
      findFirst: (...args: unknown[]) => findProject(...args),
      update: (...args: unknown[]) => updateProject(...args),
    },
    agentAttachment: {
      findFirst: (...args: unknown[]) => findAttachment(...args),
    },
  },
}));

vi.mock("@/lib/agent/attachments/storage", () => ({
  readAttachmentFile: vi.fn(),
}));

vi.mock("@/lib/agent/register-existing-figure", () => ({
  isExistingFigureName: (name: string) => /\.(png|jpe?g|webp|gif|tiff?)$/i.test(name),
  registerExistingFigure: vi.fn(async () => ({
    imageUrl: "/api/charts/existing.png",
    chartId: "chart-1",
  })),
}));

import { readAttachmentFile } from "@/lib/agent/attachments/storage";
import { registerExistingFigure } from "@/lib/agent/register-existing-figure";

const mockReadFile = readAttachmentFile as unknown as ReturnType<typeof vi.fn>;

function source(fileName: string, rowCount = 4): DataSourceAnalysis {
  return {
    fileName,
    rowCount,
    columns: [{ name: "yield", type: "numeric", count: rowCount }],
    stats: [],
    generatedAt: 1,
  };
}

function claim(sourceId: string, text: string): EvidenceClaim {
  return {
    id: `${sourceId}-C1`,
    sourceId,
    sourceType: "data",
    type: "mean",
    text,
    values: { mean: 1 },
    variables: ["yield"],
    tolerance: 5,
  };
}

function ctx(): AgentContext {
  return {
    userId: "u1",
    sessionId: "s1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 8, currentIteration: 0, maxToolCalls: 16, toolCallCount: 0 },
  };
}

const CSV = "group,yield\nCK,10\nT1,14\nT2,18\n";

describe("ingest merge", () => {
  it("normalizeIngestSourceId 与数据面板一致", () => {
    expect(normalizeIngestSourceId("yield.csv")).toBe("D-yield");
    expect(normalizeIngestSourceId("产量 表.xlsx")).toBe("D-产量_表");
  });

  it("同 fileName 覆盖源，其它源保留", () => {
    const incoming = source("a.csv", 9);
    const { sources, replaced } = mergeIngestedSources(
      [source("a.csv", 3), source("b.csv", 2)],
      incoming,
    );
    expect(replaced).toBe(true);
    expect(sources).toHaveLength(2);
    expect(sources[0]).toBe(incoming);
    expect(sources[1].fileName).toBe("b.csv");
  });

  it("新 fileName 追加", () => {
    const { sources, replaced } = mergeIngestedSources([source("a.csv")], source("b.csv"));
    expect(replaced).toBe(false);
    expect(sources.map((s) => s.fileName)).toEqual(["a.csv", "b.csv"]);
  });

  it("按 sourceId 替换声明且清掉分析器自带的另一种 id", () => {
    const next = mergeIngestedClaims(
      [claim("D-a", "old"), claim("D-a_csv", "stale"), claim("D-b", "keep")],
      [claim("D-a_csv", "new")],
      "D-a",
    );
    expect(next.map((c) => c.text).sort()).toEqual(["keep", "new"]);
  });
});

describe("ingest_project_data tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findProject.mockResolvedValue({ id: "p1", dataSources: null, dataClaims: null });
    updateProject.mockResolvedValue({});
  });

  it("未确认不写库", async () => {
    const r = await ingestProjectDataTool.execute(
      { csvData: CSV, fileName: "yield.csv" },
      ctx(),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/确认/);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("粘贴 CSV 分析后只 PATCH dataSources/dataClaims", async () => {
    const r = await ingestProjectDataTool.execute(
      { csvData: CSV, fileName: "yield.csv", userConfirmed: true },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(updateProject).toHaveBeenCalledTimes(1);
    const data = updateProject.mock.calls[0][0].data as {
      dataSources: string;
      dataClaims: string;
    };
    expect(Object.keys(data).sort()).toEqual(["dataClaims", "dataSources", "lastUpdated"]);
    const sources = JSON.parse(data.dataSources) as DataSourceAnalysis[];
    expect(sources[0].fileName).toBe("yield.csv");
    expect(sources[0].rowCount).toBe(3);
    const payload = r.data as { persisted: boolean; claimCount: number; sourceId: string };
    expect(payload.persisted).toBe(true);
    expect(payload.sourceId).toBe("D-yield");
    expect(payload.claimCount).toBeGreaterThan(0);
  });

  it("空表不写库", async () => {
    const r = await ingestProjectDataTool.execute(
      { csvData: "a,b\n", fileName: "empty.csv", userConfirmed: true },
      ctx(),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/没有识别到/);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("缺参失败", async () => {
    const r = await ingestProjectDataTool.execute({ userConfirmed: true }, ctx());
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/attachmentId|csvData/);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("无 projectId 失败", async () => {
    const r = await ingestProjectDataTool.execute(
      { csvData: CSV, fileName: "yield.csv" },
      { ...ctx(), projectId: undefined },
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/projectId/);
  });

  it("附件 csv 从磁盘读入并入库", async () => {
    findAttachment.mockResolvedValue({
      id: "att1",
      userId: "u1",
      sessionId: "s1",
      projectId: "p1",
      pinned: false,
      originalName: "trial.csv",
    });
    mockReadFile.mockReturnValue(Buffer.from(CSV, "utf8"));
    const r = await ingestProjectDataTool.execute(
      {
        attachmentId: "att1",
        userConfirmed: true,
        tablesJson: JSON.stringify([{
          label: "产量",
          note: "处理与产量",
          sheet: "CSV",
          headerRow: 1,
          columns: [1, 2],
        }]),
      },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(mockReadFile).toHaveBeenCalledWith("u1", "att1");
    expect(updateProject).toHaveBeenCalled();
  });

  it("非表格附件拒绝", async () => {
    findAttachment.mockResolvedValue({
      id: "att1",
      userId: "u1",
      sessionId: "s1",
      projectId: "p1",
      pinned: false,
      originalName: "paper.pdf",
    });
    const r = await ingestProjectDataTool.execute(
      { fileId: "att1", userConfirmed: true },
      ctx(),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/不是表格或图片/);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("组合表只写入勾选的那一块", async () => {
    const csv = "group,yield\nA,1\n\n处理,株高\nCK,10\nT,12\n";
    const r = await ingestProjectDataTool.execute(
      { csvData: csv, fileName: "combo.csv", userConfirmed: true, selectedIndices: [0] },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(updateProject).toHaveBeenCalledTimes(1);
    const data = updateProject.mock.calls[0][0].data as { dataSources: string };
    const sources = JSON.parse(data.dataSources) as DataSourceAnalysis[];
    expect(sources).toHaveLength(1);
    expect(sources[0]?.fileName).toContain("combo.csv ·");
    expect(sources[0]?.columns.some((c) => c.name === "yield")).toBe(true);
    expect(sources[0]?.columns.some((c) => c.name === "株高")).toBe(false);
  });

  it("单页成图 PDF 走已有图登记", async () => {
    findAttachment.mockResolvedValue({
      id: "figpdf",
      userId: "u1",
      sessionId: "s1",
      projectId: "p1",
      pinned: false,
      originalName: "结果.pdf",
      extractSource: "pdf_figure",
    });
    mockReadFile.mockReturnValue(Buffer.from("%PDF-1.1"));
    const r = await ingestProjectDataTool.execute(
      { attachmentId: "figpdf", userConfirmed: true },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(registerExistingFigure).toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("已有图只登记，不写数据声明", async () => {
    findAttachment.mockResolvedValue({
      id: "fig1",
      userId: "u1",
      sessionId: "s1",
      projectId: "p1",
      pinned: false,
      originalName: "结果图.png",
    });
    mockReadFile.mockReturnValue(Buffer.from("png"));
    const r = await ingestProjectDataTool.execute(
      { attachmentId: "fig1", userConfirmed: true },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(registerExistingFigure).toHaveBeenCalled();
    expect(updateProject).not.toHaveBeenCalled();
    expect(r.summary).toMatch(/没有可核对的数值/);
  });

  it("已确认的读图数值写成证据声明", async () => {
    findAttachment.mockResolvedValue({
      id: "fig1",
      userId: "u1",
      sessionId: "s1",
      projectId: "p1",
      pinned: false,
      originalName: "结果图.png",
    });
    mockReadFile.mockReturnValue(Buffer.from("png"));
    const r = await ingestProjectDataTool.execute(
      {
        attachmentId: "fig1",
        userConfirmed: true,
        dataItems: [{
          index: 0,
          kind: "figure",
          label: "结果图.png",
          fileName: "结果图.png",
          attachmentId: "fig1",
          readings: [{ series: "CK", y: "10.2", unit: "t/ha" }],
        }],
      },
      ctx(),
    );
    expect(r.success).toBe(true);
    expect(registerExistingFigure).toHaveBeenCalled();
    expect(updateProject).toHaveBeenCalled();
    const data = updateProject.mock.calls.at(-1)?.[0].data as { dataClaims: string };
    expect(data.dataClaims).toContain("10.2");
    expect(data.dataClaims).toContain("CK");
    expect(r.summary).toMatch(/1 条已核对数值/);
  });
});
