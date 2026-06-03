import { describe, it, expect } from "vitest";
import { extractNGrams, jaccardSimilarity, cosineSimilarity } from "@/lib/similarity";

describe("plagiarism — n-gram similarity", () => {
  it("detects high similarity in near-identical text", () => {
    const a = "热解温度是影响生物炭产率的关键因素，随着温度升高产率逐渐下降";
    const b = "热解温度是影响生物炭产率的关键因素，随着温度升高产率下降";
    const g4a = extractNGrams(a, 4);
    const g4b = extractNGrams(b, 4);
    const g3a = extractNGrams(a, 3);
    const g3b = extractNGrams(b, 3);
    const sim = jaccardSimilarity(g4a, g4b) * 0.6 + jaccardSimilarity(g3a, g3b) * 0.4;
    expect(sim).toBeGreaterThan(0.5);
  });

  it("detects low similarity in unrelated text", () => {
    const a = "本研究采用热重分析法对生物质样品进行了分析";
    const b = "机器学习在自然语言处理领域取得了显著进展";
    const g4a = extractNGrams(a, 4);
    const g4b = extractNGrams(b, 4);
    const g3a = extractNGrams(a, 3);
    const g3b = extractNGrams(b, 3);
    const sim = jaccardSimilarity(g4a, g4b) * 0.6 + jaccardSimilarity(g3a, g3b) * 0.4;
    expect(sim).toBeLessThan(0.1);
  });
});

describe("plagiarism — cosine similarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 2, 3, 4, 5];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});
