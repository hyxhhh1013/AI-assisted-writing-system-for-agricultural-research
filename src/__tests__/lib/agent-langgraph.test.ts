import { describe, expect, it } from "vitest";
import { buildAgentGraph, resetCompiledAgentGraphForTests } from "@/lib/agent/langgraph/graph";
import {
  MAX_PLAN_CONTINUES,
  routeAfterAgent,
  shouldContinuePlanWork,
} from "@/lib/agent/langgraph/state";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "test",
    plan: null,
    messages: [],
    iteration: 0,
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
    intentKind: null,
    approvedCheckpointKinds: [],
    ...overrides,
  };
}

describe("agent langgraph", () => {
  it("routeAfterAgent sends to tools when pending calls exist", () => {
    expect(
      routeAfterAgent(
        baseState({
          pendingToolCalls: [{ id: "1", name: "search_knowledge", args: { query: "x" } }],
        }),
      ),
    ).toBe("tools");
  });

  it("routeAfterAgent sends to finalize when finished or errored", () => {
    expect(routeAfterAgent(baseState({ finished: true }))).toBe("finalize");
    expect(routeAfterAgent(baseState({ error: "boom" }))).toBe("finalize");
    expect(routeAfterAgent(baseState())).toBe("finalize");
  });

  it("finalizes when awaiting checkpoint", () => {
    expect(
      routeAfterAgent(
        baseState({
          awaitingCheckpoint: {
            id: "cp1",
            kind: "outline_approve",
            title: "批准大纲",
            message: "请确认",
          },
        }),
      ),
    ).toBe("finalize");
  });

  it("finalizes when awaiting confirm", () => {
    expect(
      routeAfterAgent(
        baseState({
          awaitingConfirm: {
            tool: "import_reference",
            params: {},
            message: "确认导入？",
          },
        }),
      ),
    ).toBe("finalize");
  });

  it("buildAgentGraph compiles", () => {
    resetCompiledAgentGraphForTests();
    const graph = buildAgentGraph();
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
  });
});

describe("shouldContinuePlanWork", () => {
  function planState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
    return baseState({
      plan: {
        subtasks: [
          { id: "1", title: "检索文献", status: "pending", toolHints: ["search_knowledge"] },
        ],
      },
      toolSummaries: ["[search_knowledge] 完成"],
      ...overrides,
    });
  }

  function check(state: Partial<AgentGraphStateType>, planContinueCount = 0): boolean {
    return shouldContinuePlanWork({
      plan: state.plan ?? null,
      iteration: state.iteration ?? 1,
      planContinueCount,
      toolSummaries: state.toolSummaries ?? [],
      maxIterations: 32,
    });
  }

  it("continues when plan pending, tool progress, within budget", () => {
    expect(check(planState())).toBe(true);
  });

  it("does not continue without tool progress (开局提问不绑架)", () => {
    expect(check(planState({ toolSummaries: [] }))).toBe(false);
  });

  it("delivers the last nudge at exactly MAX_PLAN_CONTINUES", () => {
    expect(check(planState(), MAX_PLAN_CONTINUES)).toBe(true);
  });

  it("stops when plan continue budget exhausted (> MAX_PLAN_CONTINUES)", () => {
    expect(check(planState(), MAX_PLAN_CONTINUES + 1)).toBe(false);
  });

  it("stops at iteration cap", () => {
    expect(check(planState({ iteration: 32 }))).toBe(false);
  });

  it("does not continue when plan has no pending work", () => {
    expect(check(planState({ plan: null }))).toBe(false);
  });
});
