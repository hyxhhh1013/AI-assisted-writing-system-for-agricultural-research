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
    // 论证已并入写作蓝图：有 blueprint 时 Phase 3 一并完成
    expect(passport.phaseStatus["3"]).toBe("done");
    expect(passport.currentPhase).toBe(4);
  });

  it("phase 2 done 与写门禁共用大纲阈值（≥20 字 + 蓝图）", () => {
    const passport = recomputePassportProgress(basePassport(), {
      referenceCount: 3,
      hasBlueprint: true,
      hasArgumentBlueprint: false,
      outlineChars: 20,
      filledCoreSections: 0,
      totalCoreSections: 4,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
    });
    expect(passport.phaseStatus["2"]).toBe("done");
  });

  it("marks phase 3 done when writing blueprint exists (argument merged)", () => {
    const passport = recomputePassportProgress(basePassport(), {
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

  it("phase 3 提示确认写作蓝图主张，而非独立论证蓝图", () => {
    const passport = basePassport();
    passport.phaseStatus["0"] = "done";
    passport.phaseStatus["1"] = "done";
    passport.phaseStatus["2"] = "done";
    passport.phaseStatus["3"] = "ready";
    passport.currentPhase = 3;
    expect(getNextPhaseHint(passport)).toMatch(/写作蓝图|claim/);
    expect(getNextPhaseHint(passport)).not.toMatch(/生成论证蓝图/);
  });
});
