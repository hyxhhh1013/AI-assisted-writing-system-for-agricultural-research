import { describe, expect, it } from "vitest";
import { toolsNode } from "@/lib/agent/langgraph/nodes";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createAntispamTracker } from "@/lib/agent/core/antispam";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import { evaluatePreGates } from "@/lib/agent/langgraph/tool-gates";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import { fallbackPlan } from "@/lib/agent/core/planner";
import { literatureHuntNudge } from "@/lib/agent/core/goal-intents";

function makeTool(
  name: string,
  extra?: Partial<ToolDefinition>,
): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: "object", properties: {}, required: [] },
    safety: extra?.safety ?? "read",
    execute:
      extra?.execute
      ?? (async () => ({ success: true as const, summary: name })),
  };
}

function makeCtx(title = "未命名论文"): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
    projectSnapshot: {
      title,
      mode: "review",
      language: "zh",
      template: "sci",
      citationStyle: "gbt7714",
      researchDirection: "生物质热解",
      outline: "",
      references: [],
      dataClaims: [],
      currentPhase: 1,
      hasWritingBlueprint: false,
      hasArgumentBlueprint: false,
      sectionFills: [],
      hasPaperConfig: true,
    },
  };
}

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "检索并导入相关文献",
    plan: null,
    messages: [{ role: "user", content: "检索并导入相关文献" }],
    iteration: 1,
    toolCallCount: 0,
    planContinueCount: 0,
    reflectCount: 0,
    finalThought: null,
    toolSummaries: [],
    observations: [],
    pendingToolCalls: [],
    finished: false,
    error: null,
    events: [],
    awaitingCheckpoint: null,
    awaitingConfirm: null,
    grantedConfirm: null,
    intentKind: "literature",
    intentObsOffset: 0,
    approvedCheckpointKinds: [],
    toolTrace: [],
    ...overrides,
  };
}

function runtime(ctx: AgentContext, tools: ToolDefinition[]): AgentGraphRuntime {
  return {
    agentContext: ctx,
    tools,
    repeatTracker: createRepeatTracker(),
    antispamTracker: createAntispamTracker(ctx.projectSnapshot),
    emitLiveEvent: () => {},
  };
}

function cfg(rt: AgentGraphRuntime): LangGraphRunnableConfig {
  return { configurable: { agentRuntime: rt } };
}

describe("备文献前流程走查", () => {
  it("开场纪律是本地 PDF，不是外部摘要", () => {
    const nudge = literatureHuntNudge("检索并导入相关文献");
    expect(nudge).toContain("search_knowledge");
    expect(nudge).toContain("knowledgeHitIndices");
    expect(nudge).toMatch(/确认题目/);
    const plan = fallbackPlan("检索并导入相关文献");
    expect(plan.subtasks[0]?.toolHints).toEqual(["search_knowledge", "import_reference"]);
    expect(plan.subtasks[0]?.toolHints).not.toContain("search_external");
  });

  it("第一步并行 search_external+search_knowledge：只跑本地库", async () => {
    const ctx = makeCtx();
    const tools = [
      makeTool("search_knowledge", {
        execute: async () => ({
          success: true,
          summary: "命中 2 篇 PDF",
          data: { fileCount: 2 },
        }),
      }),
      makeTool("search_external", {
        execute: async () => ({
          success: true,
          summary: "不该执行",
          data: { count: 25 },
        }),
      }),
    ];
    const out = await toolsNode(
      baseState({
        pendingToolCalls: [
          { id: "1", name: "search_external", args: { query: "pyrolysis" } },
          { id: "2", name: "search_knowledge", args: { query: "pyrolysis" } },
        ],
      }),
      cfg(runtime(ctx, tools)),
    );
    const obs = out.observations ?? [];
    expect(obs.filter((o) => o.tool === "search_knowledge" && o.success)).toHaveLength(1);
    expect(obs.filter((o) => o.tool === "search_external" && o.success)).toHaveLength(0);
    expect(out.toolSummaries?.some((s) => /search_knowledge/.test(s))).toBe(true);
  });

  it("未确认题目时 generate_outline 停下提问，不写大纲", async () => {
    let generated = false;
    const ctx = makeCtx("未命名论文");
    const tools = [
      makeTool("generate_outline", {
        safety: "write",
        execute: async () => {
          generated = true;
          return { success: true, summary: "已生成", data: { persisted: true } };
        },
      }),
    ];
    const out = await toolsNode(
      baseState({
        pendingToolCalls: [{ id: "1", name: "generate_outline", args: {} }],
        observations: [{ tool: "import_reference", success: true, data: { imported: 8 } }],
      }),
      cfg(runtime(ctx, tools)),
    );
    expect(generated).toBe(false);
    expect(out.awaitingCheckpoint?.kind).toBe("clarify");
    expect(out.awaitingCheckpoint?.message).toMatch(/确认本篇题目/);
    expect(out.pendingToolCalls).toEqual([{ id: "1", name: "generate_outline", args: {} }]);
  });

  it("用户回复确定题目后 generate_outline 带 confirmedTitle 执行", async () => {
    const seen: Record<string, unknown>[] = [];
    const ctx = makeCtx("未命名论文");
    const tools = [
      makeTool("generate_outline", {
        safety: "write",
        execute: async (params) => {
          seen.push(params);
          return { success: true, summary: "已生成", data: { persisted: true, preview: "## 1" } };
        },
      }),
    ];
    const out = await toolsNode(
      baseState({
        messages: [
          { role: "user", content: "检索并导入相关文献" },
          {
            role: "user",
            content: "【用户回答】生物质热解催化转化制生物油与化学品\n请据此继续",
          },
        ],
        pendingToolCalls: [{ id: "1", name: "generate_outline", args: {} }],
        observations: [{ tool: "import_reference", success: true, data: { imported: 8 } }],
      }),
      cfg(runtime(ctx, tools)),
    );
    expect(seen[0]?.confirmedTitle).toBe("生物质热解催化转化制生物油与化学品");
    expect(out.awaitingCheckpoint?.kind).toBe("outline_approve");
  });

  it("门禁：本地库成功后才允许外部检索", () => {
    const blocked = evaluatePreGates({
      tool: makeTool("search_external"),
      params: { query: "q" },
      state: baseState(),
      agentContext: makeCtx(),
      repeatTracker: createRepeatTracker(),
      antispamTracker: createAntispamTracker(null),
      recentObservations: [],
    });
    expect(blocked.ok).toBe(false);
    const allowed = evaluatePreGates({
      tool: makeTool("search_external"),
      params: { query: "q" },
      state: baseState({
        observations: [{ tool: "search_knowledge", success: true }],
      }),
      agentContext: makeCtx(),
      repeatTracker: createRepeatTracker(),
      antispamTracker: createAntispamTracker(null),
      recentObservations: [{ tool: "search_knowledge", success: true }],
    });
    expect(allowed).toEqual({ ok: true });
  });
});
