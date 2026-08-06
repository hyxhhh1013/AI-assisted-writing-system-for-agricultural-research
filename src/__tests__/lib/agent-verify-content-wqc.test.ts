import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai", () => ({
  callAINonStreaming: vi.fn(async () => "Verifier 审查报告正文"),
  getAgentModelConfig: vi.fn(() => ({ provider: "zhipu", keyError: null })),
}));

import { verifyContentTool } from "@/lib/agent/tools/verify-content";
import type { AgentContext } from "@/lib/agent/types";

function makeCtx(): AgentContext {
  return {
    userId: "u1",
    projectId: "p1",
    signal: new AbortController().signal,
    budget: { maxIterations: 5, currentIteration: 0, maxToolCalls: 10, toolCallCount: 0 },
  };
}

describe("verify_content WQC 集成", () => {
  it("结果附带 quality findings（warn 级不阻断）", async () => {
    const result = await verifyContentTool.execute(
      {
        draftText: "众所周知，这种方法绝对是最优的。值得注意的是，毫无疑问它能彻底解决。",
        contextText: "上下文",
      },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    const data = result.data as {
      report: string;
      quality: Array<{ rule: string; severe?: boolean }>;
      qualitySevere: boolean;
    };
    expect(typeof data.report).toBe("string");
    expect(Array.isArray(data.quality)).toBe(true);
    expect(data.quality.some((q) => q.rule === "overclaim")).toBe(true);
    // 4 处 overclaim 命中 → severe
    expect(data.qualitySevere).toBe(true);
  });

  it("干净文本 quality 为空、不阻断", async () => {
    const result = await verifyContentTool.execute(
      {
        draftText: "本研究考察了热解温度对生物炭孔隙结构的影响，结果与文献一致。",
        contextText: "上下文",
      },
      makeCtx(),
    );
    expect(result.success).toBe(true);
    const data = result.data as { quality: unknown[]; qualitySevere: boolean };
    expect(data.quality).toEqual([]);
    expect(data.qualitySevere).toBe(false);
  });
});
