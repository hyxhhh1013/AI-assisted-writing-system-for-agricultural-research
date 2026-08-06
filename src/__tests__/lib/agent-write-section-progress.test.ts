import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/agent/writing-runner", () => ({
  runAgentWriteSection: vi.fn(),
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

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { getAgentProjectSnapshot } from "@/lib/agent/project-refresh";
import { persistAgentDraft } from "@/lib/agent/project-persist";
import { runAgentWriteSection } from "@/lib/agent/writing-runner";
import { writeSectionTool } from "@/lib/agent/tools/write-section";
import type { AgentContext } from "@/lib/agent/types";

const mockedRun = vi.mocked(runAgentWriteSection);
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

  it("ctx.emitLiveEvent 缺省时行为与现状一致（不抛错）", async () => {
    const ctx = makeCtx();
    delete ctx.emitLiveEvent;
    const result = await writeSectionTool.execute(
      { section: "introduction", context: "扩写引言", pipelineMode: "fast" },
      ctx,
    );
    expect(result.success).toBe(true);
  });
});
