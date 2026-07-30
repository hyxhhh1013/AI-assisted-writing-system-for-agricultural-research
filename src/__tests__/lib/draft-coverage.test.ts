import { describe, expect, it } from "vitest";
import {
  evaluateDraftCoverage,
  sectionCharsFromFills,
} from "@/lib/draft-coverage";

describe("evaluateDraftCoverage review", () => {
  it("flags empty and thin required sections", () => {
    const report = evaluateDraftCoverage({
      mode: "review",
      language: "zh",
      sectionChars: {
        introduction: 400,
        background: 0,
        literature_body: 3500,
        conclusion: 0,
        abstract: 0,
      },
    });
    expect(report.thinKeys).toContain("introduction");
    expect(report.requiredGaps).toEqual(
      expect.arrayContaining(["introduction", "conclusion"]),
    );
    // review_body satisfied by literature_body
    expect(report.requiredGaps).not.toContain("background");
    expect(report.nextSectionKey).toBe("introduction");
    expect(report.hint).toMatch(/引言|结论|偏薄|缺口/);
  });

  it("treats background|literature_body as alt group", () => {
    const onlyBg = evaluateDraftCoverage({
      mode: "review",
      sectionChars: {
        introduction: 1500,
        background: 2000,
        literature_body: 0,
        conclusion: 900,
      },
    });
    expect(onlyBg.okRequiredCount).toBe(onlyBg.requiredCount);
    expect(onlyBg.requiredGaps).toEqual([]);

    const neither = evaluateDraftCoverage({
      mode: "review",
      sectionChars: {
        introduction: 1500,
        background: 100,
        literature_body: 200,
        conclusion: 900,
      },
    });
    expect(neither.requiredGaps.length).toBeGreaterThan(0);
  });

  it("reports nextSectionKey for thin intro when rest ok", () => {
    const report = evaluateDraftCoverage({
      mode: "review",
      sectionChars: {
        introduction: 500,
        literature_body: 3000,
        conclusion: 1000,
        abstract: 300,
      },
    });
    expect(report.thinKeys).toContain("introduction");
    expect(report.nextSectionKey).toBe("introduction");
  });
});

describe("evaluateDraftCoverage research", () => {
  it("requires methods and results", () => {
    const report = evaluateDraftCoverage({
      mode: "research",
      sectionChars: {
        introduction: 1200,
        methods: 0,
        results: 200,
        conclusion: 700,
      },
    });
    expect(report.requiredGaps).toEqual(
      expect.arrayContaining(["methods", "results"]),
    );
    expect(report.nextSectionKey).toBe("methods");
  });
});

describe("sectionCharsFromFills", () => {
  it("maps fills to dict", () => {
    expect(
      sectionCharsFromFills([
        { key: "introduction", chars: 10 },
        { key: "methods", chars: 0 },
      ]),
    ).toEqual({ introduction: 10, methods: 0 });
  });
});
