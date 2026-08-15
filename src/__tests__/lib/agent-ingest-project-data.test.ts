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

import { readAttachmentFile } from "@/lib/agent/attachments/storage";

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

  it("粘贴 CSV 分析后只 PATCH dataSources/dataClaims", async () => {
    const r = await ingestProjectDataTool.execute(
      { csvData: CSV, fileName: "yield.csv" },
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
      { csvData: "a,b\n", fileName: "empty.csv" },
      ctx(),
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/没有有效数据行/);
    expect(updateProject).not.toHaveBeenCalled();
  });

  it("缺参失败", async () => {
    const r = await ingestProjectDataTool.execute({}, ctx());
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
    const r = await ingestProjectDataTool.execute({ attachmentId: "att1" }, ctx());
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
    const r = await ingestProjectDataTool.execute({ fileId: "att1" }, ctx());
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/不是表格/);
    expect(updateProject).not.toHaveBeenCalled();
  });
});
