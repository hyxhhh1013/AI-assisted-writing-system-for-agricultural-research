import { describe, expect, it } from "vitest";
import { askUserTool } from "@/lib/agent/tools/ask-user";
import { buildClarifyCheckpoint, decisionMessage } from "@/lib/agent/core/checkpoints";

const ctx = {
  userId: "test",
  signal: new AbortController().signal,
  budget: { maxIterations: 10, currentIteration: 0, maxToolCalls: 20, toolCallCount: 0 },
};

describe("ask_user clarification", () => {
  it("returns a clarification marker with the question", async () => {
    const r = await askUserTool.execute({ question: "确认把图注 CEC 的 [18] 改为 [21] 吗？" }, ctx);
    expect(r.success).toBe(true);
    expect((r.data as { needClarification: boolean }).needClarification).toBe(true);
    expect((r.data as { question: string }).question).toContain("[21]");
  });

  it("rejects empty question", async () => {
    const r = await askUserTool.execute({ question: "   " }, ctx);
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
  });

  it("builds a clarify checkpoint and injects the user answer", () => {
    const cp = buildClarifyCheckpoint("要改哪些引用？");
    expect(cp.kind).toBe("clarify");
    expect(cp.title).toBeTruthy();
    expect(cp.message).toBe("要改哪些引用？");

    const msg = decisionMessage("clarify", "approve", "只改图注 CEC");
    expect(msg).toContain("用户回答");
    expect(msg).toContain("只改图注 CEC");
  });
});
