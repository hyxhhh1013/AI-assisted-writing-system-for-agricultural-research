import { describe, expect, it, vi, beforeEach } from "vitest";
import { removeReferencesTool } from "@/lib/agent/tools/remove-references";
import type { AgentContext } from "@/lib/agent/types";

const applyPatchOpsMock = vi.fn(async () => ({})) as unknown as (
  ...args: unknown[]
) => Promise<unknown>;

vi.mock("@/lib/project-references", () => ({
  applyReferencePatchOps: (...args: unknown[]) => applyPatchOpsMock(...args),
}));

const txRefs = [
  { id: "r1", order: 0 },
  { id: "r2", order: 1 },
  { id: "r3", order: 2 },
];
const txSources = [
  { refIndex: 1, sourceName: "a.pdf", category: "x", citation: "" },
  { refIndex: 2, sourceName: "b.pdf", category: "y", citation: "" },
  { refIndex: 3, sourceName: "c.pdf", category: "z", citation: "" },
];
const createdSources: unknown[] = [];

const txMock = {
  reference: {
    findMany: vi.fn(async () => txRefs),
  },
  referenceSource: {
    findMany: vi.fn(async () => txSources),
    deleteMany: vi.fn(async () => ({})),
    create: vi.fn(async (d: unknown) => {
      createdSources.push(d);
      return {};
    }),
  },
  project: {
    update: vi.fn(async () => ({})),
  },
};
const transactionMock = vi.fn(
  async (...args: unknown[]) => {
    const fn = args[0] as (tx: unknown) => Promise<unknown>;
    return fn(txMock);
  },
);

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: (...args: unknown[]) => transactionMock(...args),
    reference: { count: vi.fn(async () => 1) },
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
  createdSources.length = 0;
});

describe("remove_references", () => {
  it("删除编号并清理/重排 ReferenceSource 映射", async () => {
    const r = await removeReferencesTool.execute(
      { indices: [2], reason: "不相关" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/已删除 1 条/);
    // 删除引用 op
    expect(applyPatchOpsMock).toHaveBeenCalledWith(
      txMock,
      "p1",
      [{ op: "delete", id: "r2" }],
    );
    // 分类映射：refIndex 2 被删，3 → 2；1 保留
    const kept = createdSources as Array<{ data: { refIndex: number } }>;
    const refIdx = kept.map((k) => k.data.refIndex).sort();
    expect(refIdx).toEqual([1, 2]);
  });

  it("拒绝空 indices", async () => {
    const r = await removeReferencesTool.execute({ indices: [] }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/不能为空/);
  });

  it("拒绝 0 基编号", async () => {
    const r = await removeReferencesTool.execute({ indices: [0] }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/正整数/);
  });

  it("需要 projectId", async () => {
    const r = await removeReferencesTool.execute(
      { indices: [1] },
      { ...ctx, projectId: undefined },
    );
    expect(r.success).toBe(false);
  });
});
