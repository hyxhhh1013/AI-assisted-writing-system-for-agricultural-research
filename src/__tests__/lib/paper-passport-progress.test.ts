import { describe, expect, it } from "vitest";
import {
  createInitialPaperPassport,
  type PaperPassport,
} from "@/contracts/paper-passport";
import {
  getNextPhaseHint,
  recomputePassportProgress,
  resolveCurrentPhase,
} from "@/lib/paper-passport-progress";

const config = {
  paperTitle: "T",
  paperType: "review" as const,
  targetJournal: "Fuel",
  wordCount: "8000",
  language: "zh" as const,
  citationStyle: "gbt7714" as const,
};

function basePassport(): PaperPassport {
  return createInitialPaperPassport(config, {
    directionSlug: "thermochemistry",
    linkedAt: 1,
  });
}

describe("recomputePassportProgress", () => {
  it("marks phase 1 done when references imported", () => {
    const next = recomputePassportProgress(basePassport(), {
      referenceCount: 5,
      hasBlueprint: false,
      hasArgumentBlueprint: false,
      outlineChars: 0,
      filledCoreSections: 0,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
    });
    expect(next.phaseStatus["1"]).toBe("done");
    expect(next.phaseStatus["2"]).toBe("ready");
    expect(next.currentPhase).toBe(2);
  });

  it("marks phase 2 done with outline and blueprint", () => {
    let passport = recomputePassportProgress(basePassport(), {
      referenceCount: 3,
      hasBlueprint: false,
      hasArgumentBlueprint: false,
      outlineChars: 0,
      filledCoreSections: 0,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
    });
    passport = recomputePassportProgress(passport, {
      referenceCount: 3,
      hasBlueprint: true,
      hasArgumentBlueprint: false,
      outlineChars: 200,
      filledCoreSections: 0,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
    });
    expect(passport.phaseStatus["2"]).toBe("done");
    expect(passport.currentPhase).toBe(3);
  });

  it("marks phase 3 done when argument blueprint exists", () => {
    let passport = recomputePassportProgress(basePassport(), {
      referenceCount: 3,
      hasBlueprint: true,
      hasArgumentBlueprint: false,
      outlineChars: 200,
      filledCoreSections: 0,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
    });
    passport = recomputePassportProgress(passport, {
      referenceCount: 3,
      hasBlueprint: true,
      hasArgumentBlueprint: true,
      outlineChars: 200,
      filledCoreSections: 0,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
    });
    expect(passport.phaseStatus["3"]).toBe("done");
    expect(passport.currentPhase).toBe(4);
  });

  it("resolveCurrentPhase returns first incomplete phase", () => {
    const status = basePassport().phaseStatus;
    status["0"] = "done";
    status["1"] = "done";
    status["2"] = "in_progress";
    expect(resolveCurrentPhase(status)).toBe(2);
  });
});

describe("getNextPhaseHint", () => {
  it("returns hint for current ready phase", () => {
    const passport = basePassport();
    expect(getNextPhaseHint(passport)).toContain("文献");
  });
});
