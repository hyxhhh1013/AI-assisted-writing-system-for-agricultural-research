import { describe, expect, it, vi, beforeEach } from "vitest";
import { saveReferenceClassificationTool } from "@/lib/agent/tools/save-reference-classification";
import type { AgentContext } from "@/lib/agent/types";

const upsertMock = vi.fn(async (..._args: unknown[]) => ({}));

vi.mock("@/lib/prisma", () => ({
  default: {
    referenceSource: {
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
  },
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

describe("save_reference_classification", () => {
  it("upserts classifications to ReferenceSource (1-based refIndex)", async () => {
    const r = await saveReferenceClassificationTool.execute(
      {
        classifications: [
          { refIndex: 1, sourceName: "a.pdf", category: "热解" },
          { refIndex: 2, sourceName: "b.pdf", category: "烟草", citation: "[2] xxx" },
        ],
      },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId_refIndex: { projectId: "p1", refIndex: 1 } },
        create: expect.objectContaining({
          refIndex: 1,
          sourceName: "a.pdf",
          category: "热解",
        }),
      }),
    );
  });

  it("rejects empty classifications", async () => {
    const r = await saveReferenceClassificationTool.execute(
      { classifications: [] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/不能为空/);
  });

  it("rejects invalid (0-based) refIndex", async () => {
    const r = await saveReferenceClassificationTool.execute(
      { classifications: [{ refIndex: 0, sourceName: "a.pdf", category: "x" }] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/refIndex/);
  });

  it("rejects missing sourceName", async () => {
    const r = await saveReferenceClassificationTool.execute(
      { classifications: [{ refIndex: 1, category: "x" }] },
      ctx,
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/sourceName/);
  });

  it("requires projectId", async () => {
    const r = await saveReferenceClassificationTool.execute(
      { classifications: [{ refIndex: 1, sourceName: "a.pdf", category: "x" }] },
      { ...ctx, projectId: undefined },
    );
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/projectId/);
  });
});
