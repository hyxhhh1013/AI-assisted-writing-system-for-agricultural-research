import { describe, expect, it, vi, beforeEach } from "vitest";
import { openBlueprintWorkspaceTool } from "@/lib/agent/tools/open-blueprint-workspace";
import type { AgentContext } from "@/lib/agent/types";

vi.mock("@/lib/project-writing-blueprint-db", () => ({
  readWritingBlueprint: vi.fn(async () => "blueprint-json"),
}));

const ctx: AgentContext = {
  userId: "u1",
  projectId: "p1",
  signal: new AbortController().signal,
  budget: {
    maxIterations: 5,
    currentIteration: 0,
    maxToolCalls: 10,
    toolCallCount: 0,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("open_blueprint_workspace", () => {
  it("succeeds when blueprint exists", async () => {
    const r = await openBlueprintWorkspaceTool.execute({}, ctx);
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/蓝图工作台/);
  });

  it("errors when blueprint not yet generated", async () => {
    const { readWritingBlueprint } = await import("@/lib/project-writing-blueprint-db");
    vi.mocked(readWritingBlueprint).mockResolvedValueOnce(null);
    const r = await openBlueprintWorkspaceTool.execute({}, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/尚未生成/);
  });

  it("requires projectId", async () => {
    const r = await openBlueprintWorkspaceTool.execute({}, { ...ctx, projectId: undefined });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/projectId/);
  });
});
