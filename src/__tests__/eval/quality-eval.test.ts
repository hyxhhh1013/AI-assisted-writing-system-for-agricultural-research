import { describe, expect, it } from "vitest";
import { checkCitation, checkStructure } from "@/lib/quality-eval/checks";
import { BAD_PAPER, GOOD_PAPER } from "@/lib/quality-eval/fixtures";
import { evaluateQuality } from "@/lib/quality-eval/score";

describe("W3-AP-QUALITY-EVAL paper quality rubric", () => {
  it("good paper scores clearly higher than bad paper", () => {
    const good = evaluateQuality(GOOD_PAPER);
    const bad = evaluateQuality(BAD_PAPER);
    expect(good.overallScore).toBeGreaterThanOrEqual(80);
    expect(bad.overallScore).toBeLessThan(70);
    expect(good.overallScore).toBeGreaterThan(bad.overallScore);
  });

  it("structure rewards complete sections and flags missing ones", () => {
    const good = checkStructure(GOOD_PAPER.sections);
    const bad = checkStructure(BAD_PAPER.sections);
    expect(good.score).toBeGreaterThanOrEqual(80);
    expect(bad.score).toBeLessThan(50);
    expect(bad.issues.some((i) => i.includes("结论"))).toBe(true);
  });

  it("citation penalizes out-of-bounds references", () => {
    const bad = checkCitation(BAD_PAPER.sections, BAD_PAPER.references);
    expect(bad.score).toBeLessThan(70);
    expect(bad.issues.some((i) => i.includes("越界"))).toBe(true);

    const good = checkCitation(GOOD_PAPER.sections, GOOD_PAPER.references);
    expect(good.score).toBeGreaterThanOrEqual(90);
  });

  it("emits all four dimensions with 0-100 scores", () => {
    const report = evaluateQuality(GOOD_PAPER);
    expect(report.dimensions.map((d) => d.key).sort()).toEqual(
      ["citation", "consistency", "overclaim", "structure"].sort(),
    );
    for (const d of report.dimensions) {
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(100);
    }
  });
});
