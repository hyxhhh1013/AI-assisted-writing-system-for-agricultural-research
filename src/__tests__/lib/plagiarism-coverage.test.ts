import { describe, expect, it } from "vitest";
import { buildCheckContentFromSections } from "@/lib/quality-sections";
import {
  dedupeByOffsetAndType,
  displayedOverlap,
  joinSectionBlocks,
  labelCorpusSource,
  locateParagraphs,
  overlapCoverage,
  riskFromOverlap,
} from "@/lib/plagiarism-coverage";

describe("plagiarism coverage", () => {
  it("ignores an AI hit scored at 0.4 when computing overlap", () => {
    const mixed = overlapCoverage(
      [
        { offset: 0, length: 100, matchType: "local" },
        { offset: 0, length: 400, matchType: "ai" },
      ],
      1000,
    );
    expect(mixed).toBeCloseTo(0.1);
    expect(riskFromOverlap(mixed)).toBe("medium");

    const aiOnly = overlapCoverage(
      [{ offset: 0, length: 400, matchType: "ai" }],
      1000,
    );
    expect(aiOnly).toBe(0);
    expect(riskFromOverlap(aiOnly)).toBe("low");
  });

  it("unions overlapping spans instead of double counting", () => {
    const coverage = overlapCoverage(
      [
        { offset: 0, length: 80, matchType: "local" },
        { offset: 40, length: 80, matchType: "cross" },
      ],
      200,
    );
    expect(coverage).toBeCloseTo(120 / 200);
  });

  it("keeps literature and style hits that share an offset", () => {
    const rows = dedupeByOffsetAndType([
      { sourceOffset: 0, matchType: "local", similarity: 0.8 },
      { sourceOffset: 0, matchType: "ai", similarity: 0.4 },
    ]);
    expect(rows).toHaveLength(2);
  });

  it("labels a knowledge file that is already in the project references", () => {
    expect(labelCorpusSource("稻壳生物炭.pdf", ["稻壳生物炭.pdf"])).toBe("项目文献·稻壳生物炭.pdf");
    expect(labelCorpusSource("另一篇.pdf", ["稻壳生物炭.pdf"])).toBe("另一篇.pdf");
  });

  it("joins sections the same way the quality workspace does", () => {
    const sections = [
      { key: "results", title: "结果", content: "生物炭提高了阳离子交换量。", wordCount: 14 },
    ];
    expect(joinSectionBlocks(sections)).toBe(buildCheckContentFromSections(sections, "full"));
    const located = locateParagraphs(sections);
    expect(located.canonical.indexOf("生物炭提高了阳离子交换量。")).toBe(
      located.paragraphs[0]?.offset,
    );
  });

  it("treats a missing overlapCoverage as the legacy headline", () => {
    expect(displayedOverlap({ maxSimilarity: 0.4 }).legacy).toBe(true);
    expect(displayedOverlap({ maxSimilarity: 0.4, overlapCoverage: 0.1 }).legacy).toBe(false);
    expect(displayedOverlap({ maxSimilarity: 0.4, overlapCoverage: 0 }).value).toBe(0);
  });
});
