import { describe, expect, it } from "vitest";
import {
  emptyAgentSessionSnapshot,
  isAgentSessionSnapshot,
} from "@/contracts/agent-session";
import {
  graphStateToSnapshot,
  snapshotToInitialState,
} from "@/lib/agent/session-snapshot";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "写引言",
    plan: { subtasks: [{ id: "1", title: "检索", status: "pending" }] },
    messages: [{ role: "user", content: "写引言" }],
    iteration: 2,
    toolCallCount: 1,
    planContinueCount: 0,
    reflectCount: 0,
    finalThought: null,
    toolSummaries: ["[search_knowledge] 完成"],
    observations: [{ tool: "search_knowledge", success: true }],
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

describe("agent session snapshot", () => {
  it("round-trips graph state for resume", () => {
    const snap = graphStateToSnapshot(baseState({ intentKind: "draft" }));
    expect(isAgentSessionSnapshot(snap)).toBe(true);
    expect(snap.intentKind).toBe("draft");
    expect(snap.iteration).toBe(2);
    expect(snap.toolSummaries).toHaveLength(1);
    expect(snap.observations).toEqual([{ tool: "search_knowledge", success: true }]);

    const initial = snapshotToInitialState("写引言", snap);
    expect(initial.intentKind).toBe("draft");
    expect(initial.iteration).toBe(2);
    expect(initial.plan?.subtasks[0]?.title).toBe("检索");
    expect(initial.finished).toBe(false);
    expect(initial.events).toEqual([]);
    expect(initial.observations).toEqual([{ tool: "search_knowledge", success: true }]);

    // 旧快照缺失 observations 时兜底为空数组
    const legacy = snapshotToInitialState("写引言", { ...snap, observations: undefined as never });
    expect(legacy.observations).toEqual([]);
  });

  it("empty snapshot has user goal message", () => {
    const empty = emptyAgentSessionSnapshot("检查引用");
    expect(empty.messages[0]).toEqual({ role: "user", content: "检查引用" });
  });
});
