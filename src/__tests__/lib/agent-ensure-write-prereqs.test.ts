import { describe, expect, it, vi } from "vitest";
import {
  ensureWritePrerequisites,
  listMissingWritePrereqs,
} from "@/lib/agent/core/ensure-write-prereqs";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

function snap(overrides: Partial<AgentProjectSnapshot> = {}): AgentProjectSnapshot {
  return {
    title: "T",
    mode: "review",
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "x",
    outline: "",
    references: [],
    dataClaims: [],
    currentPhase: 1,
    hasWritingBlueprint: false,
    hasArgumentBlueprint: false,
    sectionFills: [],
    hasPaperConfig: true,
    ...overrides,
  };
}

describe("listMissingWritePrereqs", () => {
  it("lists outline then writing blueprint only (argument merged in)", () => {
    expect(listMissingWritePrereqs(snap())).toEqual([
      "generate_outline",
      "generate_writing_blueprint",
    ]);
    expect(
      listMissingWritePrereqs(
        snap({
          outline: "A".repeat(50),
          hasWritingBlueprint: true,
          hasArgumentBlueprint: false,
        }),
      ),
    ).toEqual([]);
    expect(
      listMissingWritePrereqs(
        snap({
          outline: "A".repeat(50),
          hasWritingBlueprint: true,
          hasArgumentBlueprint: true,
        }),
      ),
    ).toEqual([]);
  });
});

describe("ensureWritePrerequisites", () => {
  it("runs missing tools in dependency order and refreshes", async () => {
    const state = {
      snap: snap({ outline: "A".repeat(50) }),
    };
    const ctx: AgentContext = {
      userId: "u",
      projectId: "p",
      signal: new AbortController().signal,
      projectSnapshot: state.snap,
      budget: {
        maxIterations: 10,
        currentIteration: 0,
        maxToolCalls: 20,
        toolCallCount: 0,
      },
    };

    const writing = vi.fn(async () => {
      state.snap = {
        ...state.snap,
        hasWritingBlueprint: true,
      };
      return { success: true, summary: "写作蓝图已写回" };
    });

    const tools: ToolDefinition[] = [
      {
        name: "generate_writing_blueprint",
        description: "",
        parameters: { type: "object", properties: {}, required: [] },
        safety: "write",
        execute: writing,
      },
      {
        name: "generate_outline",
        description: "",
        parameters: { type: "object", properties: {}, required: [] },
        safety: "write",
        execute: async () => ({ success: true, summary: "大纲" }),
      },
    ];

    const result = await ensureWritePrerequisites(ctx, tools, async () => {
      ctx.projectSnapshot = state.snap;
    });

    expect(result.ok).toBe(true);
    expect(result.ran).toEqual(["generate_writing_blueprint"]);
    expect(writing).toHaveBeenCalledOnce();
    expect(ctx.budget.toolCallCount).toBe(1);
  });

  it("no-ops when prerequisites already satisfied", async () => {
    const ctx: AgentContext = {
      userId: "u",
      projectId: "p",
      signal: new AbortController().signal,
      projectSnapshot: snap({
        outline: "A".repeat(50),
        hasWritingBlueprint: true,
        hasArgumentBlueprint: true,
      }),
      budget: {
        maxIterations: 10,
        currentIteration: 0,
        maxToolCalls: 20,
        toolCallCount: 0,
      },
    };
    const result = await ensureWritePrerequisites(ctx, [], async () => {});
    expect(result.ok).toBe(true);
    expect(result.ran).toEqual([]);
    expect(ctx.budget.toolCallCount).toBe(0);
  });
});
