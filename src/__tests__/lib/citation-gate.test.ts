import { describe, expect, it } from "vitest";
import { evaluateCitationGate } from "@/lib/citation-gate";
import { buildCitationGateHint } from "@/contracts/citation-gate";
import { recomputePassportProgress } from "@/lib/paper-passport-progress";
import { createInitialPaperPassport } from "@/contracts/paper-passport";

describe("evaluateCitationGate", () => {
  it("blocks when out-of-bounds citations exist", () => {
    const gate = evaluateCitationGate({
      texts: ["研究发现氮素显著提升产量[1][9]。"],
      refCount: 3,
    });
    expect(gate.passed).toBe(false);
    expect(gate.exportReady).toBe(false);
    expect(gate.outOfBounds).toContain(9);
    expect(gate.hint).toContain("越界");
  });

  it("passes when all citations within refCount", () => {
    const gate = evaluateCitationGate({
      texts: ["引言[1]。方法[2,3]。"],
      refCount: 5,
    });
    expect(gate.passed).toBe(true);
    expect(gate.exportReady).toBe(true);
    expect(gate.outOfBounds).toEqual([]);
  });

  it("allows export without inline citations but does not pass phase 5", () => {
    const gate = evaluateCitationGate({
      texts: ["没有任何引用编号的正文。"],
      refCount: 4,
    });
    expect(gate.exportReady).toBe(true);
    expect(gate.passed).toBe(false);
    expect(gate.hint).toMatch(/Phase 5|尚无 \[n\]/);
  });

  it("treats all numbers as out of bounds when refCount is 0", () => {
    const gate = evaluateCitationGate({
      texts: ["有引用[1]"],
      refCount: 0,
    });
    expect(gate.exportReady).toBe(false);
    expect(gate.outOfBounds).toContain(1);
  });
});

describe("buildCitationGateHint", () => {
  it("mentions missing refs", () => {
    expect(
      buildCitationGateHint({
        passed: false,
        exportReady: false,
        refCount: 0,
        citationCount: 0,
        uniqueNumbers: [],
        outOfBounds: [],
      }),
    ).toContain("参考文献");
  });
});

describe("passport phase 5 cite gate", () => {
  const config = {
    paperTitle: "T",
    paperType: "review" as const,
    targetJournal: "",
    wordCount: "",
    language: "zh" as const,
    citationStyle: "gbt7714" as const,
  };

  it("does not mark phase 5 done without citationGatePassed", () => {
    const passport = createInitialPaperPassport(config);
    const next = recomputePassportProgress(passport, {
      referenceCount: 5,
      hasBlueprint: true,
      hasArgumentBlueprint: true,
      outlineChars: 200,
      filledCoreSections: 4,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
      citationGatePassed: false,
      citationOutOfBounds: [12],
      citationCount: 3,
    });
    expect(next.phaseStatus["4"]).toBe("done");
    expect(next.phaseStatus["5"]).not.toBe("done");
  });

  it("marks phase 5 done when citationGatePassed", () => {
    const passport = createInitialPaperPassport(config);
    const next = recomputePassportProgress(passport, {
      referenceCount: 5,
      hasBlueprint: true,
      hasArgumentBlueprint: true,
      outlineChars: 200,
      filledCoreSections: 4,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
      citationGatePassed: true,
      citationOutOfBounds: [],
      citationCount: 4,
    });
    expect(next.phaseStatus["5"]).toBe("done");
  });
});
