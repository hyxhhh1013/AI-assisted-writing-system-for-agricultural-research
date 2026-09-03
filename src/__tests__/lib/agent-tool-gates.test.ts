import { describe, expect, it } from "vitest";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import { createAntispamTracker } from "@/lib/agent/core/antispam";
import {
  evaluatePostGates,
  evaluatePreGates,
  repeatGate,
} from "@/lib/agent/langgraph/tool-gates";
import type {
  PostGateInput,
  PreGateInput,
} from "@/lib/agent/langgraph/tool-gates";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

function makeTool(name: string, safety: ToolDefinition["safety"] = "read"): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: "object", properties: {}, required: [] },
    safety,
    execute: async () => ({ success: true as const }),
  };
}

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
  };
}

function makeState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return { goal: "写引言", approvedCheckpointKinds: [], ...overrides } as AgentGraphStateType;
}

function makePreInput(overrides: Partial<PreGateInput> = {}): PreGateInput {
  return {
    tool: makeTool("list_references"),
    params: {},
    state: makeState(),
    agentContext: makeCtx(),
    repeatTracker: createRepeatTracker(),
    antispamTracker: createAntispamTracker(null),
    recentObservations: [],
    ...overrides,
  };
}

function makePostInput(overrides: Partial<PostGateInput> = {}): PostGateInput {
  return {
    tool: makeTool("write_section", "write"),
    result: { success: true, summary: "完成" },
    state: makeState(),
    agentContext: makeCtx(),
    antispamTracker: createAntispamTracker(null),
    ...overrides,
  };
}

describe("evaluatePreGates", () => {
  it("正常只读工具全链放行", () => {
    expect(evaluatePreGates(makePreInput())).toEqual({ ok: true });
  });

  it("重复软工具（read_section）→ soft 裁决", () => {
    // 预置重复状态：read_section 已连调 3 次（maxConsecutiveSameTool=3），下次命中 → 4 次
    const tracker = createRepeatTracker();
    tracker.lastTool = "read_section";
    tracker.lastArgsKey = JSON.stringify({ section: "introduction" });
    tracker.repeatCount = 3;
    const v = evaluatePreGates(
      makePreInput({
        tool: makeTool("read_section"),
        params: { section: "introduction" },
        repeatTracker: tracker,
      }),
    );
    // read_section 是软工具且 4 次 ≤ 软停上限 8 → soft
    expect(v).toMatchObject({ ok: false, kind: "soft" });
  });

  it("非软工具重复 → hard 裁决（致命）", () => {
    const tracker = createRepeatTracker();
    tracker.lastTool = "write_section";
    tracker.lastArgsKey = JSON.stringify({ section: "introduction" });
    tracker.repeatCount = 3;
    const v = repeatGate(
      makePreInput({
        tool: makeTool("write_section", "write"),
        params: { section: "introduction" },
        repeatTracker: tracker,
      }),
    );
    // write_section 非软工具 → 直接硬停
    expect(v).toMatchObject({ ok: false, kind: "hard" });
  });

  it("检索超配额搜索 → soft 裁决", () => {
    const tracker = createAntispamTracker(null);
    tracker.searchCount = 20; // MAX_SEARCH_CALLS_PER_GOAL=20
    const v = evaluatePreGates(
      makePreInput({
        tool: makeTool("search_knowledge"),
        params: { query: "q" },
        antispamTracker: tracker,
      }),
    );
    expect(v).toMatchObject({ ok: false, kind: "soft" });
  });

  it("配额失败短路，不落到意图门禁", () => {
    const tracker = createAntispamTracker(null);
    tracker.searchCount = 20;
    const v = evaluatePreGates(
      makePreInput({
        tool: makeTool("search_knowledge"),
        params: { query: "q" },
        antispamTracker: tracker,
      }),
    );
    // 命中的是配额（soft），而非意图门禁（reject）
    expect(v).toMatchObject({ ok: false, kind: "soft" });
  });

  it("QA 未通过后出图无 replaceImageUrl → reject", () => {
    const v = evaluatePreGates(
      makePreInput({
        tool: makeTool("draft_mechanism_figure", "write"),
        params: { title: "机理图", kind: "flow" },
        recentObservations: [
          {
            tool: "read_figure",
            success: true,
            data: {
              needsRegen: true,
              imageUrl: "/api/charts/old.png",
              mode: "qa",
            },
          },
        ],
      }),
    );
    expect(v).toMatchObject({ ok: false, kind: "reject" });
    if (!v.ok && v.kind === "reject") {
      expect(v.error).toMatch(/replaceImageUrl/);
    }
  });

  it("QA 未通过但带 replaceImageUrl → 放行 figureReplaceGate", () => {
    const v = evaluatePreGates(
      makePreInput({
        tool: makeTool("draft_mechanism_figure", "write"),
        params: {
          title: "机理图",
          kind: "flow",
          replaceImageUrl: "/api/charts/old.png",
        },
        recentObservations: [
          {
            tool: "read_figure",
            success: true,
            data: {
              needsRegen: true,
              imageUrl: "/api/charts/old.png",
              mode: "qa",
            },
          },
        ],
      }),
    );
    // 可能仍被意图/先读后写等门禁挡住，但不应是 replace 门禁
    if (!v.ok && v.kind === "reject") {
      expect(v.error).not.toMatch(/质检未通过/);
    }
  });
});

describe("evaluatePostGates", () => {
  it("正常结果 → ok", () => {
    expect(evaluatePostGates(makePostInput())).toEqual({ ok: true });
  });

  it("ask_user 返回 needClarification → clarify checkpoint", () => {
    const v = evaluatePostGates(
      makePostInput({
        tool: makeTool("ask_user"),
        result: { success: true, data: { needClarification: true, question: "哪部分？" } },
      }),
    );
    expect(v).toMatchObject({ ok: false, kind: "checkpoint" });
    if (!v.ok && v.kind === "checkpoint") {
      expect(v.checkpoint.kind).toBe("clarify");
      // clarify 检查点不更新 plan 焦点（原行为），updateFocus 必须缺省
      expect(v.updateFocus).toBeUndefined();
    }
  });

  it("全文目标下未批准的 generate_outline → outline checkpoint", () => {
    const v = evaluatePostGates(
      makePostInput({
        tool: makeTool("generate_outline"),
        state: makeState({ goal: "整篇论文从零开始写" }),
        result: { success: true, summary: "大纲已生成", data: { persisted: true, preview: "1. 引言" } },
      }),
    );
    expect(v).toMatchObject({ ok: false, kind: "checkpoint" });
    if (!v.ok && v.kind === "checkpoint") {
      expect(v.checkpoint.kind).toBe("outline_approve");
      // outline 批准需同步 plan 焦点
      expect(v.updateFocus).toBe(true);
    }
  });

  it("新写回大纲即使曾批准过 → 再弹 outline checkpoint", () => {
    const v = evaluatePostGates(
      makePostInput({
        tool: makeTool("generate_outline"),
        state: makeState({ goal: "整篇论文从零开始写", approvedCheckpointKinds: ["outline_approve"] }),
        result: { success: true, data: { persisted: true } },
      }),
    );
    expect(v).toMatchObject({ ok: false, kind: "checkpoint" });
    if (!v.ok && v.kind === "checkpoint") {
      expect(v.checkpoint.kind).toBe("outline_approve");
    }
  });

  it("普通目标写回大纲 → outline checkpoint", () => {
    const v = evaluatePostGates(
      makePostInput({
        tool: makeTool("generate_outline"),
        state: makeState({ goal: "生成大纲" }),
        result: { success: true, data: { persisted: true, preview: "## 引言" } },
      }),
    );
    expect(v).toMatchObject({ ok: false, kind: "checkpoint" });
    if (!v.ok && v.kind === "checkpoint") {
      expect(v.checkpoint.kind).toBe("outline_approve");
    }
  });

  it("antispam 停滞熔断触发时累计 breakCount（供二次熔断硬停机）", () => {
    const tracker = createAntispamTracker(null);
    const input = makePostInput({
      tool: makeTool("verify_content"),
      result: { success: true, summary: "未改动" },
      antispamTracker: tracker,
    });
    let breaks = 0;
    for (let i = 0; i < 6; i++) {
      const v = evaluatePostGates(input);
      if (!v.ok && v.kind === "break") breaks++;
    }
    expect(breaks).toBeGreaterThanOrEqual(2);
    expect(tracker.breakCount).toBe(breaks);
  });
});
