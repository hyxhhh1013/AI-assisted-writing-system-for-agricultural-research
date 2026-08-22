import { describe, expect, it } from "vitest";
import { assessExportReadiness } from "@/lib/export-readiness";
import type { ProjectData } from "@/contracts/project";
import { serializePaperPassport, createInitialPaperPassport } from "@/contracts/paper-passport";
import { serializeProjectCharts } from "@/contracts/figure";

function baseProject(overrides: Partial<ProjectData> = {}): ProjectData {
  return {
    id: "p1",
    title: "T",
    authors: "",
    affiliations: "",
    abstract: "研究发现氮素显著提升产量[1]。",
    keywords: "",
    classification: "",
    researchDirection: "",
    outline: "",
    template: "sci",
    lastUpdated: 1,
    sections: {
      introduction: "背景见文献[1][2]。",
    },
    references: ["ref1", "ref2", "ref3"],
    analysisResults: [],
    language: "zh",
    ...overrides,
  };
}

describe("assessExportReadiness", () => {
  it("blocks export when citations out of bounds", () => {
    const r = assessExportReadiness(
      baseProject({
        sections: { introduction: "越界[99]" },
      }),
    );
    expect(r.ok).toBe(false);
    expect(r.gate.outOfBounds).toContain(99);
  });

  it("passes when citations within refs", () => {
    const r = assessExportReadiness(baseProject());
    expect(r.ok).toBe(true);
  });

  it("surfaces counterpart abstract from passport", () => {
    const passport = createInitialPaperPassport({
      paperTitle: "T",
      paperType: "research",
      targetJournal: "",
      wordCount: "",
      language: "zh",
      citationStyle: "gbt7714",
    });
    passport.abstractSnapshot = {
      chars: 20,
      updatedAt: 1,
      zh: "中文摘要",
      en: "English abstract counterpart.",
    };
    const r = assessExportReadiness(
      baseProject({ paperPassport: serializePaperPassport(passport) }),
    );
    expect(r.counterpartAbstract?.lang).toBe("en");
    expect(r.counterpartAbstract?.text).toContain("English");
  });

  it("allows export when refs exist and no out-of-bounds even without citations", () => {
    const r = assessExportReadiness(
      baseProject({
        abstract: "",
        sections: { introduction: "尚无引用的草稿段落。" },
      }),
    );
    expect(r.ok).toBe(true);
    expect(r.gate.passed).toBe(false);
  });

  it("lists chart captions", () => {
    const r = assessExportReadiness(
      baseProject({
        charts: serializeProjectCharts([
          {
            id: "c1",
            figureId: "bar",
            caption: "各处理产量对比",
            imageUrl: "/x.png",
            createdAt: 1,
          },
        ]),
      }),
    );
    expect(r.chartAssets).toHaveLength(1);
    expect(r.chartAssets[0].caption).toContain("产量");
  });

  it("adds soft bib_only precise-data warnings without blocking ok", () => {
    const r = assessExportReadiness(
      baseProject({
        abstract: "产率升至 42.5%[1]。",
        sections: { introduction: "背景见文献[2]。" },
      }),
      { bibOnlyIndexes: new Set([1]) },
    );
    expect(r.ok).toBe(true);
    expect(r.bibOnlyPrecise).toHaveLength(1);
    expect(r.bibOnlyPrecise[0].number).toBe(1);
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/仅书目文献含精确数据/);
  });

  it("returns empty soft fields when bibOnlyIndexes omitted", () => {
    const r = assessExportReadiness(baseProject());
    expect(r.warnings).toEqual([]);
    expect(r.bibOnlyPrecise).toEqual([]);
  });
});
