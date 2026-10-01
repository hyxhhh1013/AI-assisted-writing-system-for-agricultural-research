import { describe, expect, it } from "vitest";
import {
  intentKindFromSnapshot,
  lastFailFromSnapshot,
  snapshotMatchesFailFilter,
} from "@/lib/admin-session-fail";
import type { AgentSessionSnapshot } from "@/contracts/agent-session";

function snap(over: Partial<AgentSessionSnapshot> = {}): AgentSessionSnapshot {
  return {
    version: 1,
    messages: [],
    plan: null,
    iteration: 0,
    toolCallCount: 0,
    toolSummaries: [],
    observations: [],
    pendingToolCalls: [],
    finished: false,
    error: null,
    ...over,
  };
}

describe("admin-session-fail", () => {
  it("reads intentKind and last fail from snapshot", () => {
    const snapshot = snap({
      intentKind: "literature",
      toolTrace: [
        { at: 1, tool: "search_knowledge", ok: true },
        { at: 2, tool: "ask_user", ok: false, via: "pre-gate", reason: "quota" },
      ],
    });
    expect(intentKindFromSnapshot(snapshot)).toBe("literature");
    expect(lastFailFromSnapshot(snapshot)).toEqual({
      tool: "ask_user",
      via: "pre-gate",
      reason: "quota",
      at: 2,
    });
  });

  it("matches failTool / failVia on unsuccessful traces", () => {
    const snapshot = snap({
      toolTrace: [
        { at: 1, tool: "search_knowledge", ok: false, via: "fail" },
      ],
    });
    expect(snapshotMatchesFailFilter(snapshot, "search_knowledge", undefined)).toBe(true);
    expect(snapshotMatchesFailFilter(snapshot, "ask_user", undefined)).toBe(false);
    expect(snapshotMatchesFailFilter(snapshot, undefined, "fail")).toBe(true);
    expect(snapshotMatchesFailFilter(snapshot, undefined, "budget")).toBe(false);
    expect(snapshotMatchesFailFilter({}, "search_knowledge")).toBe(false);
  });
});
