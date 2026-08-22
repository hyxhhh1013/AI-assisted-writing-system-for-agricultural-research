import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/writing-runner", () => ({
  runAgentWriteSection: vi.fn(),
  runAgentRefineContent: vi.fn(),
}));
vi.mock("@/lib/agent/project-refresh", () => ({
  getAgentProjectSnapshot: vi.fn(),
}));
vi.mock("@/lib/agent/project-persist", () => ({
  persistAgentDraft: vi.fn(),
}));
vi.mock("@/lib/ai", () => ({
  getAgentModelConfig: vi.fn(() => ({ keyError: null, provider: "zhipu" })),
}));
vi.mock("@/lib/agent/plot-sources", () => ({
  loadAgentPlotSources: vi.fn().mockResolvedValue({ sources: [], candidates: [] }),
}));

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import { persistAgentDraft } from "@/lib/agent/project-persist";
import { runAgentRefineContent, runAgentWriteSection } from "@/lib/agent/writing-runner";
import { writeSectionTool } from "@/lib/agent/tools/write-section";
import type { AgentContext } from "@/lib/agent/types";

const mockedRun = vi.mocked(runAgentWriteSection);
const mockedRefine = vi.mocked(runAgentRefineContent);
const mockedSnapshot = vi.mocked(getAgentProjectSnapshot);
const mockedPersist = vi.mocked(persistAgentDraft);

const snapshot = {
  title: "测试论文",
  mode: "research",
  language: "zh",
  template: "sci",
  citationStyle: "gbt7714",
  researchDirection: "方向",
  outline: "1. 引言\n2. 方法",
  references: [],
  referenceEvidence: [],
  dataClaims: [],
  globalContext: {},
  currentPhase: 1,
  hasWritingBlueprint: false,
  hasArgumentBlueprint: false,
  sectionFills: [],
  hasPaperConfig: false,
} as unknown as AgentProjectSnapshot;

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
    emitLiveEvent: vi.fn(),
  };
}

describe("writeSectionTool 进度透传", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedSnapshot.mockResolvedValue(snapshot);
    mockedPersist.mockResolvedValue({ sectionKey: "introduction", referencesAdded: 0 });
    mockedRun.mockImplementation(async ({ onWritingEvent }) => {
      onWritingEvent?.({ type: "status", status: "writing" });
      onWritingEvent?.({ type: "delta", content: "x".repeat(500) });
      onWritingEvent?.({ type: "status", status: "verifying" });
      return {
        draft: "正文草稿",
        references: [],
        verification: undefined,
        issueCount: 0,
        citationWarnings: 0,
        pipelineMode: "full",
      };
    });
  });

  it("把管道事件翻译成 agent/progress 推给 ctx.emitLiveEvent", async () => {
    const ctx = makeCtx();
    const result = await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言", pipelineMode: "full" },
      ctx,
    );
    expect(result.success).toBe(true);
    const data = result.data as {
      qaReport?: { verdict: string; findings: unknown[] };
      sectionSpec?: { sectionKey: string; register: string };
    };
    expect(data.qaReport?.verdict).toBe("pass");
    expect(data.sectionSpec?.sectionKey).toBe("introduction");
    expect(data.sectionSpec?.register).toBe("introduction");
    expect(result.summary).toContain("文风质检通过");

    const emitter = vi.mocked(ctx.emitLiveEvent!);
    expect(emitter).toHaveBeenCalled();
    const calls = emitter.mock.calls.map(([e]) => e);
    expect(calls.some((e) => e.type === "agent/progress")).toBe(true);
    const labels = calls
      .filter((e) => e.type === "agent/progress")
      .map((e) => (e as { label: string }).label);
    expect(labels[0]).toContain("生成初稿");
    expect(labels[0]).toContain("引言");
  });

  it("发射结构化 agent/progress（带 stage + chars，锁死透传链路）", async () => {
    const ctx = makeCtx();
    await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言", pipelineMode: "full" },
      ctx,
    );

    const emitter = vi.mocked(ctx.emitLiveEvent!);
    const progressEvents = emitter.mock.calls
      .map(([e]) => e)
      .filter((e) => e.type === "agent/progress");
    expect(progressEvents.length).toBeGreaterThan(0);

    // 每条 agent/progress 都应带结构化字段（而不只是 label）
    for (const evt of progressEvents) {
      expect((evt as { stage?: string }).stage).toBeTruthy();
      expect(typeof (evt as { chars?: number }).chars).toBe("number");
    }

    // delta 500 字后 chars 累计到 500，锁定发射的是完整负载而非仅 label
    const deltaEvent = progressEvents.find(
      (e) => (e as { chars?: number }).chars === 500,
    );
    expect(deltaEvent).toBeDefined();
    expect((deltaEvent as { stage?: string }).stage).toBe("writing");
  });

  it("ctx.emitLiveEvent 缺省时行为与现状一致（不抛错）", async () => {
    const ctx = makeCtx();
    delete ctx.emitLiveEvent;
    const result = await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言", pipelineMode: "fast" },
      ctx,
    );
    expect(result.success).toBe(true);
  });

  it("绑定项目文献：收窄 RAG、精简摘要、不把蓝图要点打进 Writer bullets", async () => {
    const biocharAbs =
      "田间试验表明生物炭施用后土壤有机碳含量显著上升，团聚体稳定性同步改善，对旱地培肥有参考价值。";
    mockedSnapshot.mockResolvedValue({
      ...snapshot,
      references: [
        "Zhang 2020 生物炭与土壤有机碳",
        "Li 2019 水稻全基因组测序",
      ],
      referenceEvidence: [
        { index: 1, title: "生物炭与土壤有机碳", abstract: biocharAbs },
        {
          index: 2,
          title: "水稻基因组",
          abstract:
            "水稻全基因组测序揭示了籼粳分化的分子基础，转录因子调控网络与产量性状相关。",
        },
      ],
      referenceSourceNames: [{ refIndex: 1, sourceName: "biochar.pdf" }],
      globalContext: {
        blueprint: {
          version: 1,
          narrativeSummary: "综述",
          thesis: "生物炭改良土壤",
          estimatedWordCount: { min: 6000, max: 12000 },
          figurePlan: { totalMin: 1, totalMax: 2, items: [] },
          sectionGuides: [
            {
              sectionPath: "引言",
              purpose: "提出缺口",
              keyPoints: ["生物炭提高土壤有机碳并改善团聚体稳定性"],
            },
          ],
          writingOrder: [],
          prerequisites: [],
          generatedAt: 1,
          projectMode: "research",
          language: "zh",
        },
      },
    } as unknown as AgentProjectSnapshot);

    const result = await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言缺口", pipelineMode: "fast" },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    const data = result.data as {
      sectionSpec?: {
        claimCards: Array<{ evidence: Array<{ kind: string; n?: number }> }>;
      };
    };
    expect(data.sectionSpec?.claimCards[0]?.evidence.some((e) => e.n === 1)).toBe(true);

    const input = mockedRun.mock.calls[0]?.[0] as {
      data: {
        bullets?: string[];
        context: string;
        selectedSourceIds?: string[];
        referenceEvidence?: Array<{ index: number }>;
        writerProfile?: string;
      };
    };
    expect(input.data.bullets).toBeUndefined();
    expect(input.data.writerProfile).toBe("slim");
    expect(input.data.selectedSourceIds).toEqual(["biochar.pdf"]);
    expect(input.data.referenceEvidence?.map((e) => e.index)).toEqual([1]);
    expect(input.data.context).toContain("【本节主张】");
    expect(input.data.context).toContain("【证据绑定】");
    expect(input.data.context).toContain("[1]full");
    expect(input.data.context).not.toContain("旱地培肥");
  });

  it("写回前先确定性修补，不调用 refine", async () => {
    mockedRun.mockResolvedValue({
      draft:
        "众所周知，该方法具有重要的意义。值得注意的是，它也展现出较大的潜力。田间试验设置三个温度水平。",
      references: [],
      verification: undefined,
      issueCount: 0,
      citationWarnings: 0,
      pipelineMode: "fast",
    });
    const result = await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言", pipelineMode: "fast" },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    expect(mockedRefine).not.toHaveBeenCalled();
    const saved = mockedPersist.mock.calls[0]?.[3] as string;
    expect(saved).not.toContain("众所周知");
    expect(saved).not.toContain("具有重要的意义");
    expect(saved).toContain("田间试验设置三个温度水平");
    expect(result.summary).toContain("已确定性修补");
  });

  it("结果节数字对不上 dataClaims 时不写回", async () => {
    mockedSnapshot.mockResolvedValue({
      ...snapshot,
      dataClaims: [
        {
          id: "D1-C1",
          sourceId: "D1",
          sourceType: "data",
          type: "mean",
          text: "处理组土壤有机碳 18.6",
          values: { mean: 18.6 },
          variables: ["土壤有机碳"],
          tolerance: 0.05,
        },
      ],
    } as unknown as AgentProjectSnapshot);
    mockedRun.mockResolvedValue({
      draft: "处理组产量为 99.99 kg/ha。田间小区设置三个重复。",
      references: [],
      verification: undefined,
      issueCount: 0,
      citationWarnings: 0,
      pipelineMode: "fast",
    });
    const result = await writeSectionTool.execute(
      { section: "results", context: "写结果", pipelineMode: "fast" },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    const data = result.data as {
      blocked?: boolean;
      persisted?: unknown;
      qaReport?: { verdict: string };
    };
    expect(data.qaReport?.verdict).toBe("block");
    expect(data.blocked).toBe(true);
    expect(data.persisted).toBeNull();
    expect(mockedPersist).not.toHaveBeenCalled();
    expect(result.summary).toContain("未写入章节");
  });

  it("传入 sectionSpec 时 Writer 吃 Spec 而不是松散 context", async () => {
    const spec = {
      version: 1,
      sectionKey: "introduction",
      register: "introduction",
      claimCards: [
        {
          id: "C1",
          claim: "营养元素保留率仍不清楚",
          evidence: [],
        },
      ],
      constraints: { minChars: 400, maxChars: 2500 },
      assignedSourceIds: [],
      figureSlots: [],
    };
    const result = await writeSectionTool.execute(
      {
        section: "introduction",
        sectionSpec: JSON.stringify(spec),
        context: "这句话只是补充",
        pipelineMode: "fast",
      },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    const data = result.data as { specSource?: string };
    expect(data.specSource).toBe("provided");
    const input = mockedRun.mock.calls[0]?.[0] as { data: { context: string; bullets?: string[] } };
    expect(input.data.context).toContain("【本节主张】");
    expect(input.data.context).toContain("营养元素保留率仍不清楚");
    expect(input.data.context).toContain("【补充说明】这句话只是补充");
    expect(input.data.bullets).toBeUndefined();
  });
});
