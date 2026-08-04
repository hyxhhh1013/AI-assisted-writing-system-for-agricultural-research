import { describe, expect, it } from "vitest";
import { askUserTool } from "@/lib/agent/tools/ask-user";
import { buildClarifyCheckpoint, decisionMessage } from "@/lib/agent/core/checkpoints";
import { toolsNode } from "@/lib/agent/langgraph/nodes";
import type { ToolDefinition } from "@/lib/agent/types";

function mockRuntime(tools: ToolDefinition[]) {
  return {
    agentContext: {
      userId: "test",
      signal: new AbortController().signal,
      budget: { maxIterations: 32, currentIteration: 0, maxToolCalls: 64, toolCallCount: 0 },
      projectSnapshot: null,
    },
    tools,
    repeatTracker: { lastTool: null, lastArgsKey: null, repeatCount: 0 },
    antispamTracker: { searchCount: 0, stagnantCount: 0, lastFingerprint: "none" },
    emitLiveEvent: () => {},
  };
}

const baseState = {
  error: null,
  finished: false,
  pendingToolCalls: [
    { id: "t1", name: "ask_user", args: { question: "确认把图注 CEC 的 [18] 改为 [21] 吗？" } },
  ],
  toolCallCount: 0,
  plan: null,
  grantedConfirm: null,
  observations: [],
  messages: [],
  toolSummaries: [],
  events: [],
};

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

  it("toolsNode converts ask_user result into a clarify checkpoint", async () => {
    const runtime = mockRuntime([askUserTool]);
    const result = await toolsNode(
      baseState as never,
      { configurable: { agentRuntime: runtime } } as never,
    );
    expect(result.awaitingCheckpoint).toBeTruthy();
    expect(result.awaitingCheckpoint!.kind).toBe("clarify");
    expect(result.finished).toBe(true);
  });
});
