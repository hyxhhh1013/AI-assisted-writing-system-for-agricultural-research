import { describe, expect, it } from "vitest";
import type { AgentPlan } from "@/contracts/agent";
import {
  advancePlanAfterTool,
  buildFocusNudge,
  getFocusSubtask,
  markFocusRunning,
  planHasPendingWork,
} from "@/lib/agent/core/plan-progress";
import { MAX_PLAN_CONTINUES, routeAfterAgent } from "@/lib/agent/langgraph/state";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import { COST_LIMITS } from "@/lib/agent/core/safety";

function plan(overrides?: Partial<AgentPlan>): AgentPlan {
  return {
    subtasks: [
      { id: "1", title: "检索文献", status: "pending", toolHints: ["search_knowledge"] },
      { id: "2", title: "generate_outline 生成大纲", status: "pending", toolHints: ["generate_outline"] },
      { id: "3", title: "write_section 写引言", status: "pending", toolHints: ["write_section"] },
    ],
    ...overrides,
  };
}

describe("plan-progress", () => {
  it("marks first pending as running", () => {
    const p = markFocusRunning(plan());
    expect(p.subtasks[0].status).toBe("running");
    expect(getFocusSubtask(p)?.id).toBe("1");
  });

  it("advances matching tool to done and lights next", () => {
    const running = markFocusRunning(plan());
    const next = advancePlanAfterTool(running, "search_knowledge", true);
    expect(next?.subtasks[0].status).toBe("done");
    expect(next?.subtasks[1].status).toBe("running");
    expect(planHasPendingWork(next)).toBe(true);
  });

  it("matches generate_outline by title keyword", () => {
    const p = markFocusRunning({
      subtasks: [
        { id: "1", title: "generate_outline 生成并写回大纲", status: "running" },
      ],
    });
    const next = advancePlanAfterTool(p, "generate_outline", true);
    expect(next?.subtasks[0].status).toBe("done");
    expect(planHasPendingWork(next)).toBe(false);
  });

  it("builds focus nudge", () => {
    const text = buildFocusNudge(markFocusRunning(plan()));
    expect(text).toContain("【计划焦点】");
    expect(text).toContain("检索文献");
  });
});

describe("routeAfterAgent plan continue", () => {
  function base(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
    return {
      goal: "t",
      plan: null,
      messages: [],
      iteration: 1,
      toolCallCount: 0,
      planContinueCount: 0,
      reflectCount: 0,
      finalThought: "done early",
      toolSummaries: [],
      observations: [],
      pendingToolCalls: [],
      finished: false,
      error: null,
      events: [],
      awaitingCheckpoint: null,
      awaitingConfirm: null,
      grantedConfirm: null,
      approvedCheckpointKinds: [],
      ...overrides,
    };
  }

  it("finalizes when plan pending but no tool progress yet (开局提问不绑架)", () => {
    expect(
      routeAfterAgent(
        base({
          plan: markFocusRunning(plan()),
          pendingToolCalls: [],
          finished: false,
          toolSummaries: [],
        }),
      ),
    ).toBe("finalize");
  });

  it("re-enters agent to continue plan when tool progress exists and within budget", () => {
    expect(
      routeAfterAgent(
        base({
          plan: markFocusRunning(plan()),
          pendingToolCalls: [],
          finished: false,
          toolSummaries: ["[search_knowledge] 完成"],
          planContinueCount: 1,
        }),
      ),
    ).toBe("agent");
  });

  it("delivers the last nudge at exactly MAX_PLAN_CONTINUES", () => {
    expect(
      routeAfterAgent(
        base({
          plan: markFocusRunning(plan()),
          pendingToolCalls: [],
          finished: false,
          toolSummaries: ["[search_knowledge] 完成"],
          planContinueCount: MAX_PLAN_CONTINUES,
        }),
      ),
    ).toBe("agent");
  });

  it("finalizes when plan continue budget exhausted (> MAX_PLAN_CONTINUES)", () => {
    expect(
      routeAfterAgent(
        base({
          plan: markFocusRunning(plan()),
          pendingToolCalls: [],
          finished: false,
          toolSummaries: ["[search_knowledge] 完成"],
          planContinueCount: MAX_PLAN_CONTINUES + 1,
        }),
      ),
    ).toBe("finalize");
  });

  it("re-enters agent for intent continue nudge (planContinueCount 1..MAX_INTENT)", () => {
    expect(
      routeAfterAgent(
        base({
          plan: null,
          pendingToolCalls: [],
          finished: false,
          planContinueCount: 1,
        }),
      ),
    ).toBe("agent");
    expect(
      routeAfterAgent(
        base({
          plan: null,
          pendingToolCalls: [],
          finished: false,
          planContinueCount: 2,
        }),
      ),
    ).toBe("agent");
  });

  it("finalizes when intent continue exhausted (> MAX_INTENT_CONTINUES)", () => {
    expect(
      routeAfterAgent(
        base({
          plan: null,
          pendingToolCalls: [],
          finished: false,
          planContinueCount: 3,
        }),
      ),
    ).toBe("finalize");
  });

  it("finalizes when iteration at cap", () => {
    expect(
      routeAfterAgent(
        base({
          plan: markFocusRunning(plan()),
          iteration: COST_LIMITS.maxIterations,
        }),
      ),
    ).toBe("finalize");
  });
});
