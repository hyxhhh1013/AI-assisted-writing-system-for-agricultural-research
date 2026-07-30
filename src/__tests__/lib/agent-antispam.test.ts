import { describe, expect, it } from "vitest";
import {
  MAX_SEARCH_CALLS_PER_GOAL,
  MAX_STAGNANT_TOOLS,
  checkSearchQuota,
  createAntispamTracker,
  noteSearchCall,
  noteToolProgress,
  projectFingerprint,
} from "@/lib/agent/core/antispam";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

function snap(partial: Partial<AgentProjectSnapshot> = {}): AgentProjectSnapshot {
  return {
    title: "t",
    mode: "research",
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "",
    outline: "",
    references: [],
    dataClaims: [],
    currentPhase: 1,
    hasWritingBlueprint: false,
    hasArgumentBlueprint: false,
    sectionFills: [{ key: "introduction", chars: 0 }],
    hasPaperConfig: true,
    ...partial,
  };
}

describe("agent antispam", () => {
  it("fingerprint changes when outline or refs change", () => {
    const a = projectFingerprint(snap());
    const b = projectFingerprint(snap({ outline: "x".repeat(40) }));
    const c = projectFingerprint(snap({ references: ["r1"] }));
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });

  it("enforces search quota across search_external and search_knowledge", () => {
    const tracker = createAntispamTracker(snap());
    for (let i = 0; i < MAX_SEARCH_CALLS_PER_GOAL; i++) {
      expect(checkSearchQuota(tracker, "search_external").allowed).toBe(true);
      noteSearchCall(tracker, "search_external");
    }
    const blocked = checkSearchQuota(tracker, "search_knowledge");
    expect(blocked.allowed).toBe(false);
    expect(blocked.warning).toMatch(/上限/);
  });

  it("does not stagnate on context reads (read_reference before write)", () => {
    const base = snap({ references: ["r1", "r2", "r3"] });
    const tracker = createAntispamTracker(base);
    for (let i = 0; i < MAX_STAGNANT_TOOLS + 3; i++) {
      const r = noteToolProgress(tracker, "read_reference", base, true);
      expect(r.stagnant).toBe(false);
    }
    expect(tracker.stagnantCount).toBe(0);
  });

  it("stagnates after repeated non-mutating write-ish tools", () => {
    const base = snap();
    const tracker = createAntispamTracker(base);
    // verify_content 非只读豁免，也不改指纹 → 计入空转
    let last = noteToolProgress(tracker, "verify_content", base, true);
    for (let i = 1; i < MAX_STAGNANT_TOOLS; i++) {
      last = noteToolProgress(tracker, "verify_content", base, true);
    }
    expect(last.stagnant).toBe(true);
    expect(last.warning).toMatch(/未改变项目状态/);
  });

  it("does not count search_* toward stagnant (search then import flow)", () => {
    const base = snap();
    const tracker = createAntispamTracker(base);
    for (let i = 0; i < MAX_STAGNANT_TOOLS + 2; i++) {
      const r = noteToolProgress(tracker, "search_knowledge", base, true);
      expect(r.stagnant).toBe(false);
    }
    expect(tracker.stagnantCount).toBe(0);
    // 只读工具仍不计空转
    for (let i = 0; i < MAX_STAGNANT_TOOLS; i++) {
      expect(noteToolProgress(tracker, "list_references", base, true).stagnant).toBe(false);
    }
    expect(tracker.stagnantCount).toBe(0);
  });

  it("resets stagnant count when write progresses fingerprint", () => {
    const before = snap();
    const tracker = createAntispamTracker(before);
    noteToolProgress(tracker, "verify_content", before, true);
    noteToolProgress(tracker, "review_content", before, true);
    const after = snap({
      sectionFills: [{ key: "introduction", chars: 800 }],
    });
    const progressed = noteToolProgress(tracker, "write_section", after, true);
    expect(progressed.stagnant).toBe(false);
    expect(tracker.stagnantCount).toBe(0);
  });
});
