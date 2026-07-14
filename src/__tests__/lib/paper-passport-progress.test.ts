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
import type { PassportProgressSignals } from "@/lib/paper-passport-progress";

const config = {
  paperTitle: "T",
  paperType: "review" as const,
  targetJournal: "Fuel",
  wordCount: "8000",
  language: "zh" as const,
  citationStyle: "gbt7714" as const,
};

function baseSignals(over: Partial<PassportProgressSignals> = {}): PassportProgressSignals {
  return {
    referenceCount: 0,
    hasBlueprint: false,
    outlineChars: 0,
    filledCoreSections: 0,
    totalCoreSections: 4,
    expandedOutlineCount: 0,
    abstractChars: 0,
    reviewDoneCount: 0,
    hasConfirmedArgument: false,
    hasExported: false,
    ...over,
  };
}

function basePassport(): PaperPassport {
  return createInitialPaperPassport(config, {
    directionSlug: "thermochemistry",
    linkedAt: 1,
  });
}

describe("recomputePassportProgress", () => {
  it("marks phase 1 done when references imported", () => {
    const next = recomputePassportProgress(basePassport(), baseSignals({ referenceCount: 5 }));
    expect(next.phaseStatus["1"]).toBe("done");
    expect(next.phaseStatus["2"]).toBe("ready");
    expect(next.currentPhase).toBe(2);
  });

  it("marks phase 2 done with outline and blueprint", () => {
    let passport = recomputePassportProgress(basePassport(), baseSignals({ referenceCount: 3 }));
    passport = recomputePassportProgress(
      passport,
      baseSignals({ referenceCount: 3, hasBlueprint: true, outlineChars: 200 }),
    );
    expect(passport.phaseStatus["2"]).toBe("done");
    expect(passport.currentPhase).toBe(3);
  });

  it("marks phase 3 done when argument confirmed and unlocks phase 4", () => {
    let passport = recomputePassportProgress(
      basePassport(),
      baseSignals({ referenceCount: 3, hasBlueprint: true, outlineChars: 200 }),
    );
    expect(passport.phaseStatus["4"]).toBe("locked");
    passport = recomputePassportProgress(
      passport,
      baseSignals({
        referenceCount: 3,
        hasBlueprint: true,
        outlineChars: 200,
        hasConfirmedArgument: true,
      }),
    );
    expect(passport.phaseStatus["3"]).toBe("done");
    expect(passport.phaseStatus["4"]).toBe("ready");
  });

  it("keeps phase 4 locked when sections filled but argument not confirmed", () => {
    const passport = recomputePassportProgress(
      basePassport(),
      baseSignals({
        referenceCount: 3,
        hasBlueprint: true,
        outlineChars: 200,
        filledCoreSections: 4,
        totalCoreSections: 4,
        hasConfirmedArgument: false,
      }),
    );
    expect(passport.phaseStatus["3"]).not.toBe("done");
    expect(passport.phaseStatus["4"]).toBe("locked");
  });

  it("maps review to phase 6 and export to phase 7", () => {
    let passport = recomputePassportProgress(
      basePassport(),
      baseSignals({
        referenceCount: 5,
        hasBlueprint: true,
        outlineChars: 200,
        hasConfirmedArgument: true,
        filledCoreSections: 4,
        totalCoreSections: 4,
        abstractChars: 100,
      }),
    );
    expect(passport.phaseStatus["5"]).toBe("done");
    passport = recomputePassportProgress(
      passport,
      baseSignals({
        referenceCount: 5,
        hasBlueprint: true,
        outlineChars: 200,
        hasConfirmedArgument: true,
        filledCoreSections: 4,
        totalCoreSections: 4,
        abstractChars: 100,
        reviewDoneCount: 2,
      }),
    );
    expect(passport.phaseStatus["6"]).toBe("done");
    passport = recomputePassportProgress(
      passport,
      baseSignals({
        referenceCount: 5,
        hasBlueprint: true,
        outlineChars: 200,
        hasConfirmedArgument: true,
        filledCoreSections: 4,
        totalCoreSections: 4,
        abstractChars: 100,
        reviewDoneCount: 2,
        hasExported: true,
      }),
    );
    expect(passport.phaseStatus["7"]).toBe("done");
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
