import { describe, expect, it, vi } from "vitest";
import { agentNode, toolsNode } from "@/lib/agent/langgraph/nodes";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createAntispamTracker } from "@/lib/agent/core/antispam";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

vi.mock("@/lib/agent/core/llm-tools", () => ({
  callAIStreamingWithTools: vi.fn(async () => {
    throw new Error("LLM should not be called when pendingToolCalls exist");
  }),
  callAINonStreamingWithTools: vi.fn(async () => {
    throw new Error("LLM should not be called when pendingToolCalls exist");
  }),
}));

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
    projectSnapshot: {
      title: "t",
      mode: "research",
      language: "zh",
      template: "sci",
      citationStyle: "gbt7714",
      researchDirection: "",
      outline: "x".repeat(40),
      references: ["r1"],
      dataClaims: [],
      currentPhase: 1,
      hasWritingBlueprint: true,
      hasArgumentBlueprint: true,
      sectionFills: [{ key: "introduction", chars: 0 }],
      hasPaperConfig: true,
    },
  };
}

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "帮我写整篇论文",
    plan: null,
    messages: [{ role: "user", content: "写引言" }],
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
    intentKind: null,
    approvedCheckpointKinds: [],
    toolTrace: [],
    ...overrides,
  };
}

describe("resume pendingToolCalls", () => {
  it("agentNode 有 pending 时短路放行、不调 LLM", async () => {
    const ctx = makeCtx();
    const runtime: AgentGraphRuntime = {
      agentContext: ctx,
      tools: [],
      repeatTracker: createRepeatTracker(),
      antispamTracker: createAntispamTracker(ctx.projectSnapshot),
      emitLiveEvent: () => {},
    };
    const config = { configurable: { agentRuntime: runtime } } as unknown as LangGraphRunnableConfig;
    const pending = [{ id: "1", name: "write_section", args: { section: "introduction" } }];
    const out = await agentNode(
      baseState({ pendingToolCalls: pending }),
      config,
    );
    expect(out.events).toEqual([{ type: "agent/status", status: "executing" }]);
    // 不覆盖 pending（省略字段 → LangGraph 保留快照值）
    expect(out.pendingToolCalls).toBeUndefined();
    expect(out.iteration).toBeUndefined();
  });

  it("确认暂停时保留同批后续工具", async () => {
    const ctx = makeCtx();
    // 自定义需确认工具（避开 import_reference 的候选解析副作用）
    const confirmTool: ToolDefinition = {
      name: "needs_confirm_tool",
      description: "confirm",
      parameters: { type: "object", properties: {}, required: [] },
      safety: "write",
      requiresConfirmation: true,
      execute: async () => ({ success: true, summary: "done" }),
    };
    const listTool: ToolDefinition = {
      name: "list_references",
      description: "list",
      parameters: { type: "object", properties: {}, required: [] },
      safety: "read",
      execute: async () => ({ success: true, summary: "listed" }),
    };
    const runtime: AgentGraphRuntime = {
      agentContext: ctx,
      tools: [confirmTool, listTool],
      repeatTracker: createRepeatTracker(),
      antispamTracker: createAntispamTracker(ctx.projectSnapshot),
      emitLiveEvent: () => {},
    };
    const config = { configurable: { agentRuntime: runtime } } as unknown as LangGraphRunnableConfig;
    const out = await toolsNode(
      baseState({
        goal: "做一件需确认的事",
        pendingToolCalls: [
          { id: "1", name: "needs_confirm_tool", args: { x: 1 } },
          { id: "2", name: "list_references", args: {} },
        ],
      }),
      config,
    );
    expect(out.awaitingConfirm?.tool).toBe("needs_confirm_tool");
    expect(out.pendingToolCalls).toEqual([
      { id: "2", name: "list_references", args: {} },
    ]);
    expect(out.finished).toBe(true);
  });

  it("后置检查点暂停时保留同批后续工具", async () => {
    const ctx = makeCtx();
    // 清空蓝图/大纲以使 generate_outline 可触发批准；goal 为 ap-full
    ctx.projectSnapshot = {
      ...ctx.projectSnapshot!,
      outline: "",
      hasWritingBlueprint: false,
      hasArgumentBlueprint: false,
    };
    const outlineTool: ToolDefinition = {
      name: "generate_outline",
      description: "outline",
      parameters: { type: "object", properties: {}, required: [] },
      safety: "write",
      execute: async () => ({
        success: true,
        summary: "大纲已写回",
        data: { persisted: true, preview: "## 1 引言\n## 2 方法" },
      }),
    };
    const writeTool: ToolDefinition = {
      name: "write_section",
      description: "write",
      parameters: { type: "object", properties: {}, required: [] },
      safety: "write",
      execute: async () => ({ success: true, summary: "written" }),
    };
    const runtime: AgentGraphRuntime = {
      agentContext: ctx,
      tools: [outlineTool, writeTool],
      repeatTracker: createRepeatTracker(),
      antispamTracker: createAntispamTracker(ctx.projectSnapshot),
      emitLiveEvent: () => {},
    };
    const config = { configurable: { agentRuntime: runtime } } as unknown as LangGraphRunnableConfig;
    const out = await toolsNode(
      baseState({
        goal: "帮我写整篇论文",
        pendingToolCalls: [
          { id: "1", name: "generate_outline", args: {} },
          { id: "2", name: "write_section", args: { section: "introduction" } },
        ],
      }),
      config,
    );
    expect(out.awaitingCheckpoint?.kind).toBe("outline_approve");
    expect(out.pendingToolCalls).toEqual([
      { id: "2", name: "write_section", args: { section: "introduction" } },
    ]);
  });
});
