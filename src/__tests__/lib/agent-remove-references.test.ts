import { describe, expect, it, vi, beforeEach } from "vitest";
import { removeReferencesTool } from "@/lib/agent/tools/remove-references";
import type { AgentContext } from "@/lib/agent/types";

const txRefs = [
  { id: "r1", content: "[1] Ref A", order: 0, doi: "10.1/a", title: "A", abstract: null, openAccessUrl: null, externalId: null, externalSource: null },
  { id: "r2", content: "[2] Ref B", order: 1, doi: "10.1/b", title: "B", abstract: "absB", openAccessUrl: null, externalId: null, externalSource: null },
  { id: "r3", content: "[3] Ref C", order: 2, doi: "10.1/c", title: "C", abstract: null, openAccessUrl: null, externalId: null, externalSource: null },
];
const txSources = [
  { refIndex: 1, sourceName: "a.pdf", category: "x", citation: "" },
  { refIndex: 2, sourceName: "b.pdf", category: "y", citation: "" },
  { refIndex: 3, sourceName: "c.pdf", category: "z", citation: "" },
];
const createdRefs: unknown[] = [];
const createdSources: unknown[] = [];

const txMock = {
  reference: {
    findMany: vi.fn(async () => txRefs),
    deleteMany: vi.fn(async () => ({})),
    create: vi.fn(async (d: unknown) => {
      createdRefs.push(d);
      return {};
    }),
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
    reference: { count: vi.fn(async () => 2) },
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
  createdRefs.length = 0;
  createdSources.length = 0;
});

describe("remove_references", () => {
  it("删除编号并重建保留行（重排 order、保留元数据）、清理/重排分类映射", async () => {
    const r = await removeReferencesTool.execute(
      { indices: [2], reason: "不相关" },
      ctx,
    );
    expect(r.success).toBe(true);
    expect(r.summary).toMatch(/已删除 1 条/);
    // 删除全部 + 重建：保留 r1、r3，r3 的 order 2→1
    const rebuilt = createdRefs as Array<{ data: { content: string; order: number; doi?: string } }>;
    expect(rebuilt.length).toBe(2);
    expect(rebuilt.map((x) => x.data.content)).toEqual(["[1] Ref A", "[3] Ref C"]);
    expect(rebuilt.map((x) => x.data.order)).toEqual([0, 1]);
    // r3 的 doi/title 保留
    expect(rebuilt[1]?.data.doi).toBe("10.1/c");
    // 分类映射：refIndex 2 删，3→2，1 保留
    const kept = createdSources as Array<{ data: { refIndex: number } }>;
    expect(kept.map((k) => k.data.refIndex).sort()).toEqual([1, 2]);
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
