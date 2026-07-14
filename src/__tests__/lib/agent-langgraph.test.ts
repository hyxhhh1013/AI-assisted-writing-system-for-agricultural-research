import { describe, expect, it } from "vitest";
import { buildAgentGraph, resetCompiledAgentGraphForTests } from "@/lib/agent/langgraph/graph";
import { routeAfterAgent } from "@/lib/agent/langgraph/state";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "test",
    plan: null,
    messages: [],
    iteration: 0,
    toolCallCount: 0,
    finalThought: null,
    toolSummaries: [],
    pendingToolCalls: [],
    finished: false,
    error: null,
    events: [],
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

  it("buildAgentGraph compiles", () => {
    resetCompiledAgentGraphForTests();
    const graph = buildAgentGraph();
    expect(graph).toBeDefined();
    expect(typeof graph.invoke).toBe("function");
  });
});
