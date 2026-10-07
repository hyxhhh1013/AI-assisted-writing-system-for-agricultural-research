import { describe, expect, it } from "vitest";
import { buildPrereqCheckpoint, countsAsLandedMutation } from "@/lib/agent/langgraph/nodes";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "",
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
    intentObsOffset: 0,
    approvedCheckpointKinds: [],
    toolTrace: [],
    restrictToolsOnce: null,
    ...overrides,
  };
}

describe("buildPrereqCheckpoint（自动补齐批准检查点）", () => {
  it("ap-full 目标生成 outline 时触发 outline_approve 检查点", () => {
    const cp = buildPrereqCheckpoint(
      baseState({ goal: "帮我写整篇论文", approvedCheckpointKinds: [] }),
      {
        tool: "generate_outline",
        result: {
          success: true,
          data: { preview: "## 1 引言\n## 2 方法", persisted: true },
          summary: "已生成并写回大纲",
        },
      },
    );
    expect(cp).not.toBeNull();
    expect(cp!.kind).toBe("outline_approve");
    expect(cp!.preview).toContain("## 1 引言");
  });

  it("ap-full 目标生成 writing_blueprint 时触发 blueprint_approve", () => {
    const cp = buildPrereqCheckpoint(
      baseState({ goal: "整篇论文自主推进", approvedCheckpointKinds: [] }),
      {
        tool: "generate_writing_blueprint",
        result: {
          success: true,
          data: { persisted: true, preview: "# 主张\n## 各节要点\n### 引言" },
          summary: "已写回写作蓝图",
        },
      },
    );
    expect(cp).not.toBeNull();
    expect(cp!.kind).toBe("blueprint_approve");
    expect(cp!.preview).toContain("引言");
  });

  it("普通目标自动补齐大纲也触发检查点", () => {
    const cp = buildPrereqCheckpoint(
      baseState({ goal: "写引言", approvedCheckpointKinds: [] }),
      {
        tool: "generate_outline",
        result: {
          success: true,
          data: { preview: "## 1", persisted: true },
          summary: "大纲",
        },
      },
    );
    expect(cp).not.toBeNull();
    expect(cp!.kind).toBe("outline_approve");
  });

  it("新写回大纲即使曾批准过也再触发确认", () => {
    const cp = buildPrereqCheckpoint(
      baseState({ goal: "帮我写整篇论文", approvedCheckpointKinds: ["outline_approve"] }),
      {
        tool: "generate_outline",
        result: {
          success: true,
          data: { preview: "## 1", persisted: true },
          summary: "大纲",
        },
      },
    );
    expect(cp).not.toBeNull();
    expect(cp!.kind).toBe("outline_approve");
  });

  it("普通目标生成 writing_blueprint 也触发检查点", () => {
    const cp = buildPrereqCheckpoint(
      baseState({ goal: "写引言", approvedCheckpointKinds: [] }),
      {
        tool: "generate_writing_blueprint",
        result: {
          success: true,
          data: { persisted: true, preview: "# 主张\n## 引言" },
          summary: "已写回写作蓝图",
        },
      },
    );
    expect(cp).not.toBeNull();
    expect(cp!.kind).toBe("blueprint_approve");
  });

  it("step 失败时不触发检查点", () => {
    const cp = buildPrereqCheckpoint(
      baseState({ goal: "帮我写整篇论文", approvedCheckpointKinds: [] }),
      {
        tool: "generate_outline",
        result: { success: false, error: "AI 调用失败" },
      },
    );
    expect(cp).toBeNull();
  });
});

describe("countsAsLandedMutation", () => {
  it("treats a QA-blocked write_section as settled", () => {
    expect(
      countsAsLandedMutation({
        tool: "write_section",
        success: true,
        data: { persisted: null, blocked: true },
      }),
    ).toBe(true);
  });

  it("does not treat a chart QA block as landed", () => {
    expect(
      countsAsLandedMutation({
        tool: "generate_chart",
        success: true,
        data: { blocked: true, qaReport: { verdict: "block" } },
      }),
    ).toBe(false);
  });
});
