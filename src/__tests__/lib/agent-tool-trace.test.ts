import { describe, expect, it } from "vitest";
import { toolsNode } from "@/lib/agent/langgraph/nodes";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import { createAntispamTracker } from "@/lib/agent/core/antispam";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

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
    goal: "写引言",
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

function runtimeWith(tools: ToolDefinition[], ctx: AgentContext): AgentGraphRuntime {
  return {
    agentContext: ctx,
    tools,
    repeatTracker: createRepeatTracker(),
    antispamTracker: createAntispamTracker(ctx.projectSnapshot),
    emitLiveEvent: () => {},
  };
}

const config = (runtime: AgentGraphRuntime) =>
  ({ configurable: { agentRuntime: runtime } }) as unknown as LangGraphRunnableConfig;

describe("toolsNode toolTrace (W3-AP-ARCH-02)", () => {
  it("records success, carrying intentKind and epoch timestamp", async () => {
    const ctx = makeCtx();
    const okTool: ToolDefinition = {
      name: "probe_ok",
      description: "probe",
      parameters: { type: "object", properties: {}, required: [] },
      safety: "read",
      execute: async () => ({ success: true, summary: "done" }),
    };
    const runtime = runtimeWith([okTool], ctx);
    const out = await toolsNode(
      baseState({
        intentKind: "draft",
        pendingToolCalls: [{ id: "1", name: "probe_ok", args: {} }],
      }),
      config(runtime),
    );

    expect(out.toolTrace).toHaveLength(1);
    expect(out.toolTrace?.[0]).toMatchObject({
      tool: "probe_ok",
      ok: true,
      intentKind: "draft",
    });
    expect(typeof out.toolTrace?.[0]?.at).toBe("number");
  });

  it("records thrown execute failure as ok:false", async () => {
    const ctx = makeCtx();
    const failTool: ToolDefinition = {
      name: "probe_fail",
      description: "probe",
      parameters: { type: "object", properties: {}, required: [] },
      safety: "read",
      execute: async () => {
        throw new Error("boom");
      },
    };
    const runtime = runtimeWith([failTool], ctx);
    const out = await toolsNode(
      baseState({
        pendingToolCalls: [{ id: "1", name: "probe_fail", args: {} }],
      }),
      config(runtime),
    );
    expect(out.toolTrace).toEqual([
      expect.objectContaining({ tool: "probe_fail", ok: false }),
    ]);
  });

  it("unknown tool is traced as failure", async () => {
    const ctx = makeCtx();
    const runtime = runtimeWith([], ctx);
    const out = await toolsNode(
      baseState({
        pendingToolCalls: [{ id: "1", name: "nope", args: {} }],
      }),
      config(runtime),
    );
    expect(out.toolTrace).toEqual([
      expect.objectContaining({ tool: "nope", ok: false }),
    ]);
  });
});
