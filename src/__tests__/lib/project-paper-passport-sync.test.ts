import { describe, expect, it } from "vitest";
import { bootstrapPassportFromProject } from "@/lib/project-paper-passport-sync";
import { extractPaperConfigFromUnknown, parsePaperConfigWordRange } from "@/contracts/paper-passport";
import { recomputePassportProgress } from "@/lib/paper-passport-progress";

describe("ensureProjectPaperPassport bootstrap", () => {
  it("bootstraps legacy projects without paperPassport", () => {
    const passport = bootstrapPassportFromProject({
      title: "?????",
      mode: "review",
      language: "zh",
      citationStyle: "gbt7714",
    });
    expect(passport.config?.paperTitle).toBe("?????");
    expect(passport.currentPhase).toBe(1);
  });

  it("recomputes phase progress for bootstrapped passport with refs", () => {
    const passport = bootstrapPassportFromProject({
      title: "????",
      mode: "research",
      language: "zh",
      citationStyle: "ieee",
    });
    const next = recomputePassportProgress(passport, {
      referenceCount: 2,
      hasBlueprint: false,
      hasArgumentBlueprint: false,
      outlineChars: 0,
      filledCoreSections: 0,
      totalCoreSections: 5,
      expandedOutlineCount: 0,
      abstractChars: 0,
      reviewDoneCount: 0,
    });
    expect(next.phaseStatus["0"]).toBe("done");
    expect(next.phaseStatus["1"]).toBe("done");
    expect(next.currentPhase).toBe(2);
  });

  it("salvages wizard wordCount from object-shaped passport column", () => {
    const cfg = extractPaperConfigFromUnknown({
      version: 1,
      currentPhase: 1,
      updatedAt: 1,
      phaseStatus: {
        "0": "done",
        "1": "ready",
        "2": "locked",
        "3": "locked",
        "4": "locked",
        "5": "locked",
        "6": "locked",
        "7": "locked",
      },
      config: {
        paperTitle: "向导项目",
        paperType: "review",
        targetJournal: "",
        wordCount: "4000-6000",
        language: "zh",
        citationStyle: "gbt7714",
      },
    });
    expect(cfg?.wordCount).toBe("4000-6000");
    expect(parsePaperConfigWordRange(cfg?.wordCount)).toEqual({ min: 4000, max: 6000 });
  });
});
