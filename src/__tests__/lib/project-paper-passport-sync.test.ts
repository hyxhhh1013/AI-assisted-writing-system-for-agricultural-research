import { describe, expect, it } from "vitest";
import { bootstrapPassportFromProject } from "@/lib/project-paper-passport-sync";
import { recomputePassportProgress } from "@/lib/paper-passport-progress";

describe("ensureProjectPaperPassport bootstrap", () => {
  it("bootstraps legacy projects without paperPassport", () => {
    const passport = bootstrapPassportFromProject({
      title: "生物炭综述",
      mode: "review",
      language: "zh",
      citationStyle: "gbt7714",
    });
    expect(passport.config?.paperTitle).toBe("生物炭综述");
    expect(passport.currentPhase).toBe(1);
  });

  it("recomputes phase progress for bootstrapped passport with refs", () => {
    const passport = bootstrapPassportFromProject({
      title: "试验论文",
      mode: "research",
      language: "zh",
      citationStyle: "ieee",
    });
    const next = recomputePassportProgress(passport, {
      referenceCount: 2,
      hasBlueprint: false,
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
});
