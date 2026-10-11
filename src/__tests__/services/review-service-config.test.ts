import { beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({
  reviewCheck: { create: vi.fn() },
  reviewIssue: { createMany: vi.fn() },
}));

const aiMock = vi.hoisted(() => ({
  callAINonStreaming: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ default: prismaMock }));
vi.mock("@/lib/ai", () => ({ callAINonStreaming: aiMock.callAINonStreaming }));

import { runReview } from "@/services/review-service";

const input = {
  title: "稻壳生物炭对土壤阳离子交换量的影响",
  sections: [{ key: "introduction", title: "引言", content: "生物炭保留了木质素芳香结构。" }],
};

describe("runReview config merge", () => {
  beforeEach(() => {
    aiMock.callAINonStreaming.mockClear();
    prismaMock.reviewCheck.create.mockResolvedValue({ id: "rev-1" });
    prismaMock.reviewIssue.createMany.mockResolvedValue({ count: 0 });
    aiMock.callAINonStreaming.mockImplementation(async (options: { messages: Array<{ content: string }> }) => {
      const system = options.messages[0]?.content ?? "";
      if (system.includes("总体评价")) {
        return JSON.stringify({ synopsis: "概要", summary: "评价" });
      }
      return JSON.stringify({ issues: [] });
    });
  });

  it("keeps the four default dimensions when config.dimensions is omitted", async () => {
    await runReview({
      ...input,
      config: { dimensions: undefined, target: undefined },
    });

    const dimensionCalls = aiMock.callAINonStreaming.mock.calls.filter(
      (call) => !String(call[0].messages[0].content).includes("总体评价"),
    );
    expect(dimensionCalls).toHaveLength(4);
  });

  it("reviews only the dimensions that were selected", async () => {
    await runReview({
      ...input,
      config: { dimensions: ["academic"] },
    });

    const dimensionCalls = aiMock.callAINonStreaming.mock.calls.filter(
      (call) => !String(call[0].messages[0].content).includes("总体评价"),
    );
    expect(dimensionCalls).toHaveLength(1);
  });
});
