import { describe, expect, it } from "vitest";
import {
  checkRepeatCall,
  createRepeatTracker,
  COST_LIMITS,
} from "@/lib/agent/core/safety";

describe("agent safety", () => {
  it("blocks identical consecutive tool calls beyond limit", () => {
    const tracker = createRepeatTracker();
    const params = { query: "biochar" };

    for (let i = 0; i < COST_LIMITS.maxConsecutiveSameTool; i++) {
      const result = checkRepeatCall(tracker, "search_knowledge", params);
      expect(result.allowed).toBe(true);
    }

    const blocked = checkRepeatCall(tracker, "search_knowledge", params);
    expect(blocked.allowed).toBe(false);
    expect(blocked.warning).toMatch(/连续调用/);
  });

  it("resets repeat counter when params change", () => {
    const tracker = createRepeatTracker();
    checkRepeatCall(tracker, "search_knowledge", { query: "a" });
    checkRepeatCall(tracker, "search_knowledge", { query: "b" });
    const again = checkRepeatCall(tracker, "search_knowledge", { query: "b" });
    expect(again.allowed).toBe(true);
  });
});
