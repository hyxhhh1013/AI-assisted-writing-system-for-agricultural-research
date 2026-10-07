import { describe, expect, it, vi } from "vitest";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { AgentPhaseState } from "@/contracts/agent-phase";
import { toolsNode } from "@/lib/agent/langgraph/nodes";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import { createAntispamTracker } from "@/lib/agent/core/antispam";
import {
  parseEnforcedPhases,
  parsePhaseCardEnabled,
  parsePhaseDoneMode,
  parsePhaseMode,
  phaseShadowReason,
} from "@/lib/agent/core/phase-flags";
import { createRepeatTracker } from "@/lib/agent/core/safety";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

const literature: AgentPhaseState = {
  phase: "literature",
  packPhase: 1,
  nextAction: "按本题检索并导入相关文献",
  doneWhen: "本轮导入至少一批",
};

function makeCtx(extra: Partial<AgentContext> = {}): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
    projectSnapshot: {
      title: "t",
      mode: "review",
      language: "zh",
      template: "sci",
      citationStyle: "gbt7714",
      researchDirection: "",
      outline: "",
      references: [],
      dataClaims: [],
      currentPhase: 1,
      hasWritingBlueprint: false,
      hasArgumentBlueprint: false,
      sectionFills: [],
      hasPaperConfig: true,
    },
    phaseState: literature,
    ...extra,
  };
}

function baseState(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
  return {
    goal: "找文献",
    plan: null,
    messages: [{ role: "user", content: "找文献" }],
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
    intentKind: "literature",
    intentObsOffset: 0,
    approvedCheckpointKinds: [],
    toolTrace: [],
    restrictToolsOnce: null,
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

const probe: ToolDefinition = {
  name: "probe_outside",
  description: "probe",
  parameters: { type: "object", properties: {}, required: [] },
  safety: "read",
  execute: async () => ({ success: true, summary: "done" }),
};

describe("parsePhaseMode", () => {
  it("accepts shadow and enforce, everything else is off", () => {
    expect(parsePhaseMode("shadow")).toBe("shadow");
    expect(parsePhaseMode(" ENFORCE ")).toBe("enforce");
    expect(parsePhaseMode("on")).toBe("off");
    expect(parsePhaseMode("")).toBe("off");
    expect(parsePhaseMode(null)).toBe("off");
    expect(parsePhaseMode("shadoww")).toBe("off");
  });

  it("parses later flags without turning them on by accident", () => {
    expect(parseEnforcedPhases("literature, no-such, draft")).toEqual(
      new Set(["literature", "draft"]),
    );
    expect(parseEnforcedPhases(null).size).toBe(0);
    expect(parsePhaseCardEnabled("1")).toBe(true);
    expect(parsePhaseCardEnabled("0")).toBe(false);
    expect(parsePhaseDoneMode("shadow")).toBe("shadow");
    expect(parsePhaseDoneMode("maybe")).toBe("off");
  });
});

describe("phaseShadowReason", () => {
  it("stays quiet unless the mode is shadow and the tool is outside the phase", () => {
    const ctx = makeCtx();
    expect(phaseShadowReason("write_section", ctx)).toBeNull();
    expect(phaseShadowReason("write_section", { ...ctx, phaseMode: "off" })).toBeNull();
    expect(phaseShadowReason("write_section", { ...ctx, phaseMode: "enforce" })).toBeNull();
    expect(phaseShadowReason("search_knowledge", { ...ctx, phaseMode: "shadow" })).toBeNull();
    expect(phaseShadowReason("inspect_project", { ...ctx, phaseMode: "shadow" })).toBeNull();
    expect(phaseShadowReason("write_section", { ...ctx, phaseMode: "shadow" }))
      .toBe("phase=literature 不含 write_section");
  });

  it("lets a review draft search, and marks the same search on a research draft", () => {
    const draft: AgentPhaseState = {
      phase: "draft",
      packPhase: 4,
      nextAction: "写引言并保存到当前项目",
      doneWhen: "写回一节",
    };
    const review = makeCtx({
      phaseMode: "shadow",
      phaseState: draft,
      projectSnapshot: { ...makeCtx().projectSnapshot!, mode: "review" },
    });
    const research = makeCtx({
      phaseMode: "shadow",
      phaseState: draft,
      projectSnapshot: { ...makeCtx().projectSnapshot!, mode: "research" },
    });
    expect(phaseShadowReason("search_knowledge", review)).toBeNull();
    expect(phaseShadowReason("import_reference", review)).toBeNull();
    expect(phaseShadowReason("search_knowledge", research))
      .toBe("phase=draft 不含 search_knowledge");
  });
});

describe("toolsNode phase shadow", () => {
  it("marks an out-of-phase tool and still runs it", async () => {
    const executed = vi.fn(async () => ({ success: true, summary: "done" }));
    const tool: ToolDefinition = { ...probe, execute: executed };
    const ctx = makeCtx({ phaseMode: "shadow" });
    const out = await toolsNode(
      baseState({ pendingToolCalls: [{ id: "1", name: "probe_outside", args: {} }] }),
      config(runtimeWith([tool], ctx)),
    );
    expect(executed).toHaveBeenCalledOnce();
    expect(out.toolTrace?.map((row) => row.via)).toEqual(["phase-shadow", "ok"]);
    expect(out.toolTrace?.[0]).toMatchObject({
      tool: "probe_outside",
      ok: true,
      via: "phase-shadow",
      reason: "phase=literature 不含 probe_outside",
    });
    expect(out.observations?.some((row) => row.tool === "probe_outside" && row.success)).toBe(true);
  });

  it("adds no shadow trace when the switch is off", async () => {
    const ctx = makeCtx({ phaseMode: "off" });
    const out = await toolsNode(
      baseState({ pendingToolCalls: [{ id: "1", name: "probe_outside", args: {} }] }),
      config(runtimeWith([probe], ctx)),
    );
    expect(out.toolTrace).toHaveLength(1);
    expect(out.toolTrace?.[0]?.via).toBe("ok");
  });
});
