import { describe, expect, it } from "vitest";
import { createInitialPaperPassport, parsePaperPassport, serializePaperPassport } from "@/contracts/paper-passport";
import { enrichPassportSnapshots } from "@/lib/paper-passport-snapshots";
import { resolveTaskNavigation } from "@/lib/paper-passport-tasks";

const sampleConfig = {
  paperTitle: "测试",
  paperType: "review" as const,
  targetJournal: "期刊",
  wordCount: "8000-12000",
  language: "zh" as const,
  citationStyle: "gbt7714" as const,
};

describe("paper-passport-snapshots", () => {
  it("enriches literature and draft progress on sync", () => {
    const passport = createInitialPaperPassport(sampleConfig);
    const enriched = enrichPassportSnapshots(passport, {
      referenceCount: 5,
      hasBlueprint: true,
      hasArgumentBlueprint: false,
      outlineChars: 200,
      filledCoreSections: 2,
      totalCoreSections: 5,
      expandedOutlineCount: 1,
      abstractChars: 100,
      reviewDoneCount: 1,
    });
    expect(enriched.literature?.referenceCount).toBe(5);
    expect(enriched.draftProgress?.hasBlueprint).toBe(true);
    expect(enriched.reviewRound?.doneCount).toBe(1);
    const parsed = parsePaperPassport(serializePaperPassport(enriched));
    expect(parsed?.literature?.referenceCount).toBe(5);
  });
});

describe("resolveTaskNavigation", () => {
  it("routes outline tasks to outline tab", () => {
    expect(resolveTaskNavigation("outline-gen", "human")).toEqual({
      type: "workbench-tab",
      tab: "outline",
    });
  });

  it("routes drafting to agent tab in agent mode", () => {
    expect(resolveTaskNavigation("draft-start", "agent")).toEqual({
      type: "workbench-tab",
      tab: "agent",
    });
  });
});
