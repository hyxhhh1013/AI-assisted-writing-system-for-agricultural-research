import { describe, expect, it } from "vitest";
import { emptyAgentSessionSnapshot } from "@/contracts/agent-session";
import {
  buildFollowUpInitialState,
  clipMessages,
} from "@/lib/agent/session-continue";
import type { LLMMessage } from "@/lib/agent/types";

describe("session-continue", () => {
  it("appends new goal and resets turn counters", () => {
    const snap = emptyAgentSessionSnapshot("写引言");
    snap.messages = [
      { role: "user", content: "写引言" },
      { role: "assistant", content: "已完成大纲" },
    ];
    snap.iteration = 5;
    snap.toolCallCount = 3;
    snap.plan = { subtasks: [{ id: "1", title: "写", status: "done" }] };

    const next = buildFollowUpInitialState("改成写方法", snap);
    expect(next.goal).toBe("改成写方法");
    expect(next.intentKind).toBe("draft");
    expect(next.iteration).toBe(0);
    expect(next.toolCallCount).toBe(0);
    expect(next.plan).toBeNull();
    expect(next.intentObsOffset).toBe(0);
    expect(next.messages?.at(-1)).toEqual({
      role: "user",
      content: "改成写方法",
    });
    expect(next.messages?.[0]).toEqual({ role: "user", content: "写引言" });
  });

  it("clips long history", () => {
    const many: LLMMessage[] = Array.from({ length: 50 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `m${i}`,
    }));
    const clipped = clipMessages(many, 10);
    expect(clipped).toHaveLength(10);
    expect(clipped[0]?.content).toBe("m40");
  });

  it("inherits draft intentKind when follow-up is A", () => {
    const snap = emptyAgentSessionSnapshot("写引言");
    snap.intentKind = "draft";
    const next = buildFollowUpInitialState("A", snap);
    expect(next.intentKind).toBe("draft");
  });

  it("sets intentObsOffset to historical observation length", () => {
    const snap = emptyAgentSessionSnapshot("写研究现状");
    snap.intentKind = "draft";
    snap.observations = [
      { tool: "write_section", success: true },
      { tool: "list_references", success: true },
    ];
    const next = buildFollowUpInitialState("继续", snap);
    expect(next.intentObsOffset).toBe(2);
    expect(next.observations).toHaveLength(2);
  });
});
