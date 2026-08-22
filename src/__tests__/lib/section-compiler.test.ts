import { describe, expect, it } from "vitest";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import {
  bulletsFromCompiledSpec,
  compileSectionSpec,
} from "@/lib/agent/section-compiler";

function sampleBlueprint(over: Partial<WritingBlueprint> = {}): WritingBlueprint {
  return {
    version: 1,
    narrativeSummary: "综述",
    thesis: "生物炭改良土壤",
    estimatedWordCount: { min: 6000, max: 12000 },
    figurePlan: { totalMin: 1, totalMax: 2, items: [] },
    sectionGuides: [],
    writingOrder: [],
    prerequisites: [],
    generatedAt: 1,
    projectMode: "research",
    language: "zh",
    ...over,
  };
}

describe("compileSectionSpec", () => {
  it("rejects unknown section keys", () => {
    expect(compileSectionSpec({ sectionKey: "appendix", context: "x" })).toBeNull();
  });

  it("prefers user bullets over blueprint keyPoints", () => {
    const compiled = compileSectionSpec({
      sectionKey: "introduction",
      mode: "research",
      language: "zh",
      bullets: ["用户要点 A"],
      context: "应被忽略的 context",
      blueprint: sampleBlueprint({
        sectionGuides: [
          {
            sectionPath: "引言",
            purpose: "提出缺口",
            keyPoints: ["蓝图要点不该用"],
            claim: "蓝图主张",
            warrant: "因为文献不一致",
          },
        ],
      }),
    });
    expect(compiled?.source).toBe("bullets");
    expect(compiled?.spec.claimCards.map((c) => c.claim)).toEqual(["用户要点 A"]);
    expect(compiled?.spec.claimCards[0]?.warrant).toBe("因为文献不一致");
  });

  it("falls back to blueprint cards and exposes them as writer bullets", () => {
    const compiled = compileSectionSpec({
      sectionKey: "introduction",
      mode: "research",
      context: "补充一句",
      blueprint: sampleBlueprint({
        sectionGuides: [
          {
            sectionPath: "引言",
            purpose: "提出缺口",
            keyPoints: ["机制不清", "田间证据少"],
            warrant: "现有结果不一致",
          },
        ],
      }),
    });
    expect(compiled?.source).toBe("blueprint");
    expect(compiled?.spec.claimCards).toHaveLength(2);
    expect(bulletsFromCompiledSpec(compiled)).toEqual(["机制不清", "田间证据少"]);
  });

  it("applies research coverage floor and subsection cap", () => {
    const intro = compileSectionSpec({
      sectionKey: "introduction",
      mode: "research",
      language: "zh",
      context: "写引言",
    });
    expect(intro?.spec.constraints.minChars).toBeGreaterThanOrEqual(1000);
    expect(intro?.spec.constraints.forbidDiscussionInResults).toBeUndefined();

    const sub = compileSectionSpec({
      sectionKey: "literature_body",
      mode: "review",
      language: "zh",
      subsectionTitle: "2.1 孔隙结构",
      context: "写子节",
    });
    expect(sub?.spec.register).toBe("review_body");
    expect(sub?.spec.constraints.maxChars).toBeLessThanOrEqual(2500);
    expect(sub?.spec.constraints.minChars).toBeLessThan(2000);
  });

  it("scales English budgets and keeps abstract cite ban", () => {
    const abs = compileSectionSpec({
      sectionKey: "abstract",
      language: "en",
      mode: "research",
      context: "Write the abstract",
    });
    expect(abs?.spec.constraints.forbidInlineCite).toBe(true);
    expect(abs?.spec.constraints.minChars).toBeLessThan(150);
    expect(abs?.source).toBe("context");
  });

  it("resolves assigned sources and figure slots for a subsection", () => {
    const compiled = compileSectionSpec({
      sectionKey: "results",
      mode: "research",
      subsectionTitle: "孔隙",
      context: "写结果",
      referenceSourceNames: [{ refIndex: 2, sourceName: "paper-b.pdf" }],
      blueprint: sampleBlueprint({
        sectionGuides: [
          {
            sectionPath: "结果 > 孔隙",
            purpose: "报告孔径",
            keyPoints: ["600°C 最高"],
            assignedSources: ["[2]", "extra.pdf"],
          },
        ],
        figurePlan: {
          totalMin: 1,
          totalMax: 1,
          items: [
            {
              id: "fig-pore",
              sectionPath: "结果 > 孔隙",
              type: "chart",
              purpose: "孔径分布",
              suggestedCaption: "图1 孔径",
              priority: "required",
            },
          ],
        },
      }),
    });
    expect(compiled?.spec.assignedSourceIds).toEqual(
      expect.arrayContaining(["paper-b.pdf", "extra.pdf"]),
    );
    expect(compiled?.spec.figureSlots).toContain("fig-pore");
    expect(compiled?.spec.constraints.forbidDiscussionInResults).toBe(true);
  });
});
