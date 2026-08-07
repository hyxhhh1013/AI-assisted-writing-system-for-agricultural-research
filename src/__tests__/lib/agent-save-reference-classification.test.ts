import { describe, expect, it, vi, beforeEach } from "vitest";
import { saveReferenceClassificationTool } from "@/lib/agent/tools/save-reference-classification";
import type { AgentContext } from "@/lib/agent/types";

const upsertMock = vi.fn(async () => ({})) as unknown as (
  ...args: unknown[]
) => Promise<unknown>;
const findRefMock = vi.fn(async () => ({
  title: "兜底标题",
  content: "[1] 题录",
})) as unknown as (...args: unknown[]) => Promise<unknown>;

vi.mock("@/lib/prisma", () => ({
  default: {
    referenceSource: {
      upsert: (...args: unknown[]) => upsertMock(...args),
    },
    reference: {
      findFirst: (...args: unknown[]) => findRefMock(...args),
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

  it("sourceName 可省略：用对应引用题录兜底", async () => {
    const r = await saveReferenceClassificationTool.execute(
      { classifications: [{ refIndex: 1, category: "热解" }] },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(findRefMock).toHaveBeenCalled();
    // upsert 用兜底题录作为 sourceName
    const calls = (
      upsertMock as unknown as { mock: { calls: Array<Array<unknown>> } }
    ).mock.calls;
    const call = calls[0]?.[0] as {
      update?: { sourceName?: string };
      create?: { sourceName?: string };
    };
    const sourceName = call?.update?.sourceName ?? call?.create?.sourceName;
    expect(sourceName).toBe("兜底标题");
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
