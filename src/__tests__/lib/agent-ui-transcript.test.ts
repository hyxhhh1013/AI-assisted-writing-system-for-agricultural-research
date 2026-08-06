import { describe, expect, it } from "vitest";
import {
  appendUiFromAgentEvent,
  mergeSessionTranscripts,
  seedUiTranscript,
} from "@/lib/agent/ui-transcript";
import { buildPriorConversationMessages } from "@/lib/agent/conversation-continuity";
import { emptyAgentSessionSnapshot } from "@/contracts/agent-session";

describe("ui-transcript", () => {
  it("seeds user goal", () => {
    expect(seedUiTranscript("写引言")).toEqual([{ kind: "user", text: "写引言" }]);
  });

  it("appends thought / action / observation / summary", () => {
    let t = seedUiTranscript("写引言");
    t = appendUiFromAgentEvent(t, { type: "agent/thought", content: "先看大纲" });
    t = appendUiFromAgentEvent(t, {
      type: "agent/action",
      tool: "inspect_project",
      params: {},
    });
    t = appendUiFromAgentEvent(t, {
      type: "agent/observation",
      tool: "inspect_project",
      result: { success: true, summary: "缺大纲" },
    });
    t = appendUiFromAgentEvent(t, {
      type: "agent/complete",
      summary: { text: "建议先生成大纲", toolCallCount: 1, keyFindings: [] },
    });
    expect(t.map((m) => m.kind)).toEqual([
      "user",
      "thought",
      "action",
      "observation",
      "summary",
    ]);
  });

  it("merges multi-session transcripts in order with dividers", () => {
    const merged = mergeSessionTranscripts([
      {
        goal: "A",
        uiTranscript: [{ kind: "user", text: "A" }, { kind: "thought", text: "ok" }],
      },
      { goal: "B", uiTranscript: undefined },
    ]);
    expect(merged).toEqual([
      { kind: "user", text: "A" },
      { kind: "thought", text: "ok" },
      { kind: "divider", label: "上一会话 · 2" },
      { kind: "user", text: "B" },
    ]);
  });
});

describe("conversation-continuity", () => {
  it("builds prior user/assistant turns from recent sessions", () => {
    const snap = emptyAgentSessionSnapshot("写引言");
    snap.uiTranscript = [
      { kind: "user", text: "写引言" },
      {
        kind: "summary",
        summary: { text: "已生成大纲草稿", toolCallCount: 2, keyFindings: [] },
      },
    ];
    const msgs = buildPriorConversationMessages([
      { goal: "写引言", status: "completed", snapshot: snap },
    ]);
    expect(msgs).toHaveLength(2);
    expect(msgs[0]?.role).toBe("user");
    expect(msgs[0]?.content).toContain("写引言");
    expect(msgs[1]?.role).toBe("assistant");
    expect(msgs[1]?.content).toContain("大纲");
  });
});
