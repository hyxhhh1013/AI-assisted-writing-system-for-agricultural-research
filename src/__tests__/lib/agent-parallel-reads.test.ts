import { describe, expect, it } from "vitest";
import { toolsNode } from "@/lib/agent/langgraph/nodes";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import {
  allParallelSafe,
  PARALLEL_READ_TOOLS,
  runParallelReads,
} from "@/lib/agent/langgraph/parallel-tools";
import { createAntispamTracker } from "@/lib/agent/core/antispam";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentContext, ParsedToolCall, ToolDefinition } from "@/lib/agent/types";

function readTool(name: string): ToolDefinition {
  return {
    name,
    description: name,
    parameters: { type: "object", properties: {}, required: [] },
    safety: "read",
    execute: async (params: Record<string, unknown>) => ({
      success: true as const,
      summary: `read ${params.id}`,
      data: { text: `ref ${params.id}` },
    }),
  };
}

const writeTool: ToolDefinition = {
  name: "write_section",
  description: "w",
  parameters: { type: "object", properties: {}, required: [] },
  safety: "write",
  execute: async () => ({ success: true as const }),
};

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
  };
}

function makeRuntime(tools: ToolDefinition[], ctx: AgentContext): AgentGraphRuntime {
  return {
    agentContext: ctx,
    tools,
    repeatTracker: createRepeatTracker(),
    antispamTracker: createAntispamTracker(null),
  };
}

function call(id: string, name = "read_reference", args: Record<string, unknown> = { id }): ParsedToolCall {
  return { id, name, args };
}

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "检索文献",
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
    approvedCheckpointKinds: [],
    ...overrides,
  };
}

describe("allParallelSafe", () => {
  it("两个白名单只读工具 → 可并行", () => {
    const tools = [readTool("read_reference"), readTool("read_section")];
    expect(
      allParallelSafe([call("1", "read_reference"), call("2", "read_section")], tools),
    ).toBe(true);
  });

  it("单个调用不走并行（无收益）", () => {
    const tools = [readTool("read_reference")];
    expect(allParallelSafe([call("1")], tools)).toBe(false);
  });

  it("混入写工具 → 不可并行（退回串行）", () => {
    const tools = [readTool("read_reference"), writeTool];
    expect(allParallelSafe([call("1"), call("2", "write_section")], tools)).toBe(false);
  });

  it("未知工具 → 不可并行", () => {
    const tools = [readTool("read_reference")];
    expect(allParallelSafe([call("1"), call("2", "nope")], tools)).toBe(false);
  });

  it("白名单集合包含常用只读工具", () => {
    expect(PARALLEL_READ_TOOLS.has("inspect_project")).toBe(true);
    expect(PARALLEL_READ_TOOLS.has("search_knowledge")).toBe(true);
    expect(PARALLEL_READ_TOOLS.has("write_section")).toBe(false);
  });
});

describe("runParallelReads", () => {
  it("并发执行只读调用，结果按原顺序产出，预算正确累计", async () => {
    const ctx = makeCtx();
    const readCalls = [call("1", "read_reference", { id: "A" }), call("2", "read_reference", { id: "B" })];
    const runtime = makeRuntime([readTool("read_reference")], ctx);
    const out = await runParallelReads(baseState({ pendingToolCalls: readCalls }), runtime);

    expect(out.pendingToolCalls).toEqual([]);
    expect(out.observations).toHaveLength(2);
    expect((out.observations ?? []).map((o) => o.data)).toEqual([
      { text: "ref A" },
      { text: "ref B" },
    ]);
    expect(out.toolSummaries).toEqual(["[read_reference] read A", "[read_reference] read B"]);
    expect(ctx.budget.toolCallCount).toBe(2);
    expect(out.toolCallCount).toBe(2);
    const actions = (out.events ?? []).filter((e) => e.type === "agent/action");
    const obs = (out.events ?? []).filter((e) => e.type === "agent/observation");
    expect(actions).toHaveLength(2);
    expect(obs).toHaveLength(2);
  });

  it("未知工具记失败但不影响其它调用", async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime([readTool("read_reference")], ctx);
    const out = await runParallelReads(
      baseState({
        pendingToolCalls: [call("1"), call("2", "nope", {})],
      }),
      runtime,
    );
    expect(out.observations).toHaveLength(1);
    expect((out.observations ?? [])[0]!.success).toBe(true);
    expect((out.toolSummaries ?? []).some((s) => s.includes("未知工具"))).toBe(true);
  });

  it("诊断批次 [inspect_project, list_references] 门禁增量放行（不误拒）", async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime(
      [readTool("inspect_project"), readTool("list_references")],
      ctx,
    );
    const out = await runParallelReads(
      baseState({
        goal: "诊断一下项目卡在哪",
        pendingToolCalls: [
          call("1", "inspect_project", { id: "P" }),
          call("2", "list_references", { id: "L" }),
        ],
      }),
      runtime,
    );
    expect((out.observations ?? []).map((o) => o.tool).sort()).toEqual([
      "inspect_project",
      "list_references",
    ]);
    expect(ctx.budget.toolCallCount).toBe(2);
  });

  it("连续同一参数重复调用超阈值时硬停", async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime([readTool("read_reference")], ctx);
    // repeatTracker 共享在 runtime 上：先累计 3 次相同调用（前 3 次 allowed）
    for (let i = 0; i < 3; i++) {
      await runParallelReads(
        baseState({ pendingToolCalls: [call(String(i), "read_reference", { id: "S" })] }),
        runtime,
      );
    }
    // 第 4 次相同参数：checkRepeatCall 硬停（read_reference 非软工具，>3 即停）
    const out = await runParallelReads(
      baseState({ pendingToolCalls: [call("3", "read_reference", { id: "S" })] }),
      runtime,
    );
    expect(out.error).toBeTruthy();
    expect((out.events ?? []).some((e) => e.type === "agent/error")).toBe(true);
  });
});

describe("toolsNode 集成（并行快路径接入）", () => {
  it("全只读白名单批次经 toolsNode 走并行快路径（A,A,O,O 事件序）", async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime([readTool("read_reference")], ctx);
    const config = { configurable: { agentRuntime: runtime } } as unknown as LangGraphRunnableConfig;
    const state = baseState({
      pendingToolCalls: [
        call("1", "read_reference", { id: "A" }),
        call("2", "read_reference", { id: "B" }),
      ],
    });
    const out = await toolsNode(state, config);
    const seq = (out.events ?? [])
      .filter((e) => e.type === "agent/action" || e.type === "agent/observation")
      .map((e) => e.type);
    expect(seq).toEqual(["agent/action", "agent/action", "agent/observation", "agent/observation"]);
    expect((out.observations ?? []).map((o) => o.data)).toEqual([{ text: "ref A" }, { text: "ref B" }]);
  });

  it("混入非白名单只读工具时经 toolsNode 走串行路径（A,O,A,O 事件序）", async () => {
    const ctx = makeCtx();
    const runtime = makeRuntime([readTool("read_reference"), readTool("check_consistency")], ctx);
    const config = { configurable: { agentRuntime: runtime } } as unknown as LangGraphRunnableConfig;
    const state = baseState({
      pendingToolCalls: [
        call("1", "read_reference", { id: "A" }),
        call("2", "check_consistency", { id: "C" }),
      ],
    });
    const out = await toolsNode(state, config);
    const seq = (out.events ?? [])
      .filter((e) => e.type === "agent/action" || e.type === "agent/observation")
      .map((e) => e.type);
    expect(seq).toEqual(["agent/action", "agent/observation", "agent/action", "agent/observation"]);
  });
});
