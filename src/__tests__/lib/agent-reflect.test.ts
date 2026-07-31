import { describe, expect, it } from "vitest";
import type { ToolObservation } from "@/lib/agent/types";
import {
  analyzeReflection,
  MAX_REFLECT_ROUNDS,
} from "@/lib/agent/core/reflect";
import {
  routeAfterAgent,
  shouldReflect,
} from "@/lib/agent/langgraph/state";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

const obs = (
  tool: string,
  data?: unknown,
  success = true,
): ToolObservation => ({ tool, success, ...(data !== undefined ? { data } : {}) });

const WRITE = obs("write_section", {
  section: "literature_body",
  persisted: { sectionKey: "literature_body" },
});
const VALIDATE_OK = obs("validate_citations", {
  exportReady: true,
  phase5Passed: true,
  grounding: { suspiciousCount: 0 },
});
const VALIDATE_ISSUES = obs("validate_citations", {
  exportReady: false,
  phase5Passed: false,
  grounding: { suspiciousCount: 3 },
});
const REFINE = obs("refine_content", {
  sectionKey: "literature_body",
  persisted: { sectionKey: "literature_body" },
});

describe("analyzeReflection", () => {
  it("no write work → no reflection", () => {
    expect(analyzeReflection([]).action).toBeNull();
    expect(analyzeReflection([obs("search_knowledge")]).action).toBeNull();
  });

  it("write not persisted → not a write", () => {
    const r = analyzeReflection([
      obs("write_section", { section: "x", persisted: null }),
    ]);
    expect(r.action).toBeNull();
  });

  it("write without any verify → verify nudge", () => {
    const r = analyzeReflection([WRITE]);
    expect(r.action).toBe("verify");
    expect(r.nudge).toContain("validate_citations");
    expect(r.section).toBe("literature_body");
  });

  it("verify before write does not count", () => {
    const r = analyzeReflection([VALIDATE_OK, WRITE]);
    expect(r.action).toBe("verify");
  });

  it("validate ok after write → done", () => {
    expect(analyzeReflection([WRITE, VALIDATE_OK]).action).toBeNull();
  });

  it("validate with issues → refine nudge with count", () => {
    const r = analyzeReflection([WRITE, VALIDATE_ISSUES]);
    expect(r.action).toBe("refine");
    expect(r.issueCount).toBe(3);
    expect(r.nudge).toContain("refine_content");
  });

  it("validate issues then refine → done", () => {
    expect(analyzeReflection([WRITE, VALIDATE_ISSUES, REFINE]).action).toBeNull();
  });

  it("verify_content (free report) → treated as verified", () => {
    expect(
      analyzeReflection([WRITE, obs("verify_content", { report: "ok" })]).action,
    ).toBeNull();
  });

  it("failed validate does not count as verified", () => {
    const r = analyzeReflection([
      WRITE,
      obs("validate_citations", {}, false),
    ]);
    expect(r.action).toBe("verify");
  });
});

describe("reflection routing", () => {
  function base(overrides: Partial<AgentGraphStateType> = {}): AgentGraphStateType {
    return {
      goal: "写综述",
      plan: null,
      messages: [],
      iteration: 1,
      toolCallCount: 0,
      planContinueCount: 0,
      reflectCount: 0,
      finalThought: "写完了",
      toolSummaries: [],
      observations: [],
      pendingToolCalls: [],
      finished: false,
      error: null,
      events: [],
      awaitingCheckpoint: null,
      awaitingConfirm: null,
      grantedConfirm: null,
      approvedCheckpointKinds: [],
      ...overrides,
    };
  }

  it("finished with unverified write → reflect", () => {
    expect(
      routeAfterAgent(base({ finished: true, observations: [WRITE] })),
    ).toBe("reflect");
  });

  it("finished with verified write → finalize", () => {
    expect(
      routeAfterAgent(base({ finished: true, observations: [WRITE, VALIDATE_OK] })),
    ).toBe("finalize");
  });

  it("finished with reflect budget exhausted → finalize", () => {
    expect(
      shouldReflect(base({ finished: true, observations: [WRITE], reflectCount: MAX_REFLECT_ROUNDS })),
    ).toBe(false);
    expect(
      routeAfterAgent(base({ finished: true, observations: [WRITE], reflectCount: MAX_REFLECT_ROUNDS })),
    ).toBe("finalize");
  });

  it("not finished → never reflect (正常推理/工具中)", () => {
    expect(routeAfterAgent(base())).toBe("finalize");
    expect(
      routeAfterAgent(base({ pendingToolCalls: [{ id: "1", name: "x", args: {} }] })),
    ).toBe("tools");
  });

  it("shouldReflect true only for unverified write within budget", () => {
    expect(shouldReflect(base({ finished: true, observations: [WRITE] }))).toBe(true);
    expect(shouldReflect(base({ finished: true, observations: [] }))).toBe(false);
  });
});
