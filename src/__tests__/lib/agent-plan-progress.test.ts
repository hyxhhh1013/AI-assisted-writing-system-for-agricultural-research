import { describe, expect, it } from "vitest";
import type { AgentPlan } from "@/contracts/agent";
import {
  advancePlanAfterTool,
  getFocusSubtask,
  markFocusRunning,
  planHasPendingWork,
  thoughtAnnouncesUnfinishedTool,
  isPlanLeftoverSpeech,
  shouldResetPlanContinueCount,
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

  it("matches generate_table by title keyword", () => {
    const p = markFocusRunning({
      subtasks: [
        { id: "1", title: "生成结果三线表", status: "running" },
      ],
    });
    const next = advancePlanAfterTool(p, "generate_table", true);
    expect(next?.subtasks[0].status).toBe("done");
  });

  it("matches generate_table by title keyword", () => {
    const p = markFocusRunning({
      subtasks: [
        { id: "1", title: "生成结果三线表", status: "running" },
      ],
    });
    const next = advancePlanAfterTool(p, "generate_table", true);
    expect(next?.subtasks[0].status).toBe("done");
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

  it("does not complete 写作蓝图 when generate_outline succeeds", () => {
    const next = advancePlanAfterTool(
      {
        subtasks: [
          {
            id: "2",
            title: "基于已有43篇文献生成综述大纲",
            status: "running",
            toolHints: ["generate_outline"],
          },
          {
            id: "3",
            title: "依据大纲生成写作蓝图，写入各节claim",
            status: "pending",
            toolHints: ["generate_writing_blueprint"],
          },
        ],
      },
      "generate_outline",
      true,
    );
    expect(next?.subtasks[0]?.status).toBe("done");
    expect(next?.subtasks[1]?.status).toBe("running");
  });

  it("does not complete 生成大纲 when list_references succeeds", () => {
    const next = advancePlanAfterTool(
      {
        subtasks: [
          { id: "1", title: "读取项目配置与文献库", status: "done", toolHints: ["inspect_project"] },
          {
            id: "2",
            title: "基于已有43篇文献生成综述大纲",
            status: "running",
            toolHints: ["generate_outline"],
          },
        ],
      },
      "list_references",
      true,
    );
    expect(next?.subtasks[1]?.status).toBe("running");
  });

  it("title-only 蓝图任务 is not completed by unmatched generate_outline", () => {
    const next = advancePlanAfterTool(
      {
        subtasks: [
          { id: "2", title: "基于已有43篇文献生成综述大纲", status: "done" },
          { id: "3", title: "依据大纲生成写作蓝图", status: "running" },
        ],
      },
      "generate_outline",
      true,
    );
    expect(next?.subtasks[1]?.status).toBe("running");
  });

  it("detects announced blueprint that was never called", () => {
    const hit = thoughtAnnouncesUnfinishedTool(
      "大纲已生成并写回。现在生成写作蓝图（含各节 claim）：",
      [{ tool: "generate_outline", success: true }],
    );
    expect(hit?.tool).toBe("generate_writing_blueprint");
  });

  it("does not reset continue count on read/search tools", () => {
    expect(shouldResetPlanContinueCount(["search_knowledge", "list_references"])).toBe(false);
    expect(shouldResetPlanContinueCount(["write_section"])).toBe(true);
    expect(shouldResetPlanContinueCount(["search_knowledge", "write_section"])).toBe(true);
  });

  it("detects announced write_section that was never settled", () => {
    const hit = thoughtAnnouncesUnfinishedTool(
      "撰写引言章节，对齐蓝图要点：",
      [{ tool: "list_references", success: true }],
    );
    expect(hit?.tool).toBe("write_section");
    expect(
      thoughtAnnouncesUnfinishedTool("撰写引言章节，对齐蓝图要点：", [
        { tool: "write_section", success: true },
      ]),
    ).toBeNull();
  });

  it("does not treat leftover「先写引言」as an announced write_section", () => {
    const leftover =
      "还有未完成步骤：生成图2并保存。你可以直接说「继续」或指定下一步（例如「先写引言」）。";
    expect(isPlanLeftoverSpeech(leftover)).toBe(true);
    expect(thoughtAnnouncesUnfinishedTool(leftover, [])).toBeNull();
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
      intentKind: null,
      approvedCheckpointKinds: [],
      toolTrace: [],
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

  it("does not re-enter agent when finished even if continue count is still in range", () => {
    expect(
      routeAfterAgent(
        base({
          plan: null,
          pendingToolCalls: [],
          finished: true,
          planContinueCount: 2,
          toolSummaries: ["[search_knowledge] 完成"],
        }),
      ),
    ).toBe("finalize");
    expect(
      routeAfterAgent(
        base({
          plan: markFocusRunning(plan()),
          pendingToolCalls: [],
          finished: true,
          toolSummaries: ["[search_knowledge] 完成"],
          planContinueCount: MAX_PLAN_CONTINUES,
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

  it("re-enters agent when figure QA needs replace even if continue budget exhausted", () => {
    expect(
      routeAfterAgent(
        base({
          plan: null,
          pendingToolCalls: [],
          finished: true,
          planContinueCount: 99,
          observations: [
            {
              tool: "read_figure",
              success: true,
              data: {
                needsRegen: true,
                imageUrl: "/api/charts/bad.png",
                mode: "qa",
              },
            },
          ],
        }),
      ),
    ).toBe("agent");
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
