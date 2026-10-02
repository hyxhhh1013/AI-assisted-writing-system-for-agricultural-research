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

  it("clears prior toolSummaries so 执行摘要不会整段回放", () => {
    const snap = emptyAgentSessionSnapshot("写引言");
    snap.toolSummaries = ["[validate_citations] 硬检通过", "[write_section] 旧一轮"];
    const next = buildFollowUpInitialState("继续", snap);
    expect(next.toolSummaries).toEqual([]);
  });

  it("expands a numeric reply into the last 1/2/3 option", () => {
    const snap = emptyAgentSessionSnapshot("写综述");
    snap.intentKind = "draft";
    snap.uiTranscript = [
      { kind: "user", text: "继续" },
      {
        kind: "thought",
        text:
          "下一步请选：\n1. 继续写 literature_body 子节「生物油定向调控」\n2. 先写结论\n回复 1 / 2 即可。",
      },
    ];
    const next = buildFollowUpInitialState("1", snap);
    expect(next.goal).toContain("literature_body");
    expect(next.goal).toContain("生物油");
    expect(next.intentKind).toBe("review_write");
  });

  it("keeps 文生图 intent when follow-up goal is only 图1、4", () => {
    const snap = emptyAgentSessionSnapshot("用文生图画流程图");
    snap.messages = Array.from({ length: 42 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `old-${i}`,
    }));
    snap.uiTranscript = [{ kind: "user", text: "用文生图画流程图" }];
    const next = buildFollowUpInitialState("图1、4", snap);
    expect(next.messages?.some((m) => String(m.content).includes("文生图"))).toBe(true);
  });
});
