import { describe, expect, it, vi, beforeEach } from "vitest";
import type { AgentContext } from "@/lib/agent/types";

// P0 防数据丢失：refine_content 写回时必须用项目内整节做 Refiner 底稿，
// 模型传片段不能覆盖整节；Refiner 输出异常过短时拒绝写回。
const { prismaMock, runAgentRefineContent, persistAgentDraft } = vi.hoisted(() => ({
  prismaMock: {
    project: { findFirst: vi.fn() },
    section: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
  runAgentRefineContent: vi.fn(),
  persistAgentDraft: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));

vi.mock("@/lib/agent/writing-runner", () => ({
  runAgentRefineContent,
}));

vi.mock("@/lib/agent/project-refresh", () => ({
  getAgentProjectSnapshot: vi.fn().mockResolvedValue({
    mode: "review",
    references: [{}, {}],
  }),
}));

vi.mock("@/lib/agent/project-persist", () => ({
  persistAgentDraft,
}));

// 延迟引入工具，等 vi.mock 生效
import { refineContentTool } from "@/lib/agent/tools/refine-content";

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
  } as unknown as AgentContext;
}

const STORED = "完整章节正文内容……".repeat(60);
const REFINED = "修正后的完整章节正文……".repeat(60);

describe("refine_content 写回保护（P0 防片段覆盖）", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.section.findUnique.mockResolvedValue({ content: STORED });
    persistAgentDraft.mockResolvedValue({ sectionKey: "introduction", referencesAdded: 0 });
    runAgentRefineContent.mockResolvedValue({ draft: REFINED, charCount: REFINED.length });
  });

  it("模型传片段时，以项目内整节为 Refiner 底稿（片段不覆盖）", async () => {
    const result = await refineContentTool.execute(
      { section: "introduction", draftText: "只有一小段", feedback: "修正引用编号" },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    expect(runAgentRefineContent).toHaveBeenCalledWith(
      expect.objectContaining({ draft: STORED }),
    );
    expect(persistAgentDraft).toHaveBeenCalledWith(
      "u1",
      "p1",
      "introduction",
      REFINED,
    );
  });

  it("Refiner 输出异常过短时拒绝写回（防二次覆盖）", async () => {
    runAgentRefineContent.mockResolvedValue({ draft: "短", charCount: 1 });
    const result = await refineContentTool.execute(
      { section: "introduction", draftText: STORED, feedback: "改一处引用" },
      makeCtx(),
    );
    expect(result.success).toBe(false);
    expect(String(result.error)).toMatch(/异常过短/);
    expect(persistAgentDraft).not.toHaveBeenCalled();
  });

  it("项目内章节为空时回退模型 draftText", async () => {
    prismaMock.section.findUnique.mockResolvedValue({ content: null });
    runAgentRefineContent.mockResolvedValue({ draft: "基于片段的修正稿", charCount: 10 });
    const result = await refineContentTool.execute(
      { section: "introduction", draftText: "模型片段", feedback: "补内容" },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    expect(runAgentRefineContent).toHaveBeenCalledWith(
      expect.objectContaining({ draft: "模型片段" }),
    );
  });
});
