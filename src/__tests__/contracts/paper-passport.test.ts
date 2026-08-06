import { describe, expect, it } from "vitest";
import {
  createInitialPaperPassport,
  parsePaperPassport,
  serializePaperPassport,
} from "@/contracts/paper-passport";

const sampleConfig = {
  paperTitle: "测试论文",
  paperType: "review" as const,
  targetJournal: "Fuel",
  wordCount: "8000-12000",
  language: "zh" as const,
  citationStyle: "gbt7714" as const,
};

describe("paper-passport", () => {
  it("creates initial passport with phase 0 done and phase 1 ready", () => {
    const passport = createInitialPaperPassport(sampleConfig, {
      directionSlug: "thermochemistry",
      candidateId: "c1",
      linkedAt: 1,
    });
    expect(passport.phaseStatus["0"]).toBe("done");
    expect(passport.phaseStatus["1"]).toBe("ready");
    expect(passport.currentPhase).toBe(1);
    expect(passport.source?.directionSlug).toBe("thermochemistry");
  });

  it("round-trips serialize and parse", () => {
    const passport = createInitialPaperPassport(sampleConfig);
    const parsed = parsePaperPassport(serializePaperPassport(passport));
    expect(parsed).toEqual(passport);
  });

  it("returns null for invalid JSON", () => {
    expect(parsePaperPassport("{bad")).toBeNull();
    expect(parsePaperPassport('{"version":2}')).toBeNull();
  });
});
