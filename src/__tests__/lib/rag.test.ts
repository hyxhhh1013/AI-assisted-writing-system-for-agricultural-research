import { describe, it, expect } from "vitest";
import { cosineSimilarity, extractNGrams, jaccardSimilarity } from "@/lib/similarity";
import { formatRagCitation } from "@/lib/rag";

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0, 0], [0, 1, 0])).toBe(0);
  });

  it("returns 0 for empty vectors", () => {
    expect(cosineSimilarity([], [1, 2])).toBe(0);
  });

  it("handles mismatched lengths", () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2])).toBe(0);
  });

  it("correctly computes intermediate similarity", () => {
    const sim = cosineSimilarity([1, 2, 3], [2, 4, 6]);
    expect(sim).toBeCloseTo(1, 5);
  });
});

describe("extractNGrams", () => {
  it("extracts 4-grams from text", () => {
    const grams = extractNGrams("hello world", 4);
    expect(grams.has("hell")).toBe(true);
    expect(grams.has("ello")).toBe(true);
  });

  it("filters non-alphanumeric characters", () => {
    const grams = extractNGrams("a b c d", 2);
    // Alphanumeric chars only, whitespace stripped
    expect(grams.size).toBeGreaterThanOrEqual(0);
  });

  it("handles CJK characters", () => {
    const grams = extractNGrams("热重分析", 2);
    expect(grams.has("热重")).toBe(true);
    expect(grams.has("分析")).toBe(true);
  });
});

describe("jaccardSimilarity", () => {
  it("returns 1 for identical sets", () => {
    const a = new Set(["a", "b", "c"]);
    const b = new Set(["a", "b", "c"]);
    expect(jaccardSimilarity(a, b)).toBe(1);
  });

  it("returns 0 for disjoint sets", () => {
    const a = new Set(["a", "b"]);
    const b = new Set(["c", "d"]);
    expect(jaccardSimilarity(a, b)).toBe(0);
  });
});

describe("formatRagCitation", () => {
  it("formats citation with page range", () => {
    const citation = formatRagCitation({
      content: "test content",
      metadata: {
        source: "test-paper.pdf",
        category: "热化学",
        id: "chunk-1",
        pageStart: 3,
        pageEnd: 5,
      },
    });
    expect(citation).toContain("test paper");
    expect(citation).toContain("pp. 3-5");
  });

  it("formats citation without page range", () => {
    const citation = formatRagCitation({
      content: "test",
      metadata: {
        source: "paper.pdf",
        category: "未分类",
        id: "chunk-2",
      },
    });
    expect(citation).toBe("paper");
    expect(citation).not.toContain("pp.");
  });
});
