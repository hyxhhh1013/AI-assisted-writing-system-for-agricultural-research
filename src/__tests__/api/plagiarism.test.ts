import { describe, it, expect } from "vitest";
import { extractNGrams, jaccardSimilarity, computeSimHash, hammingDistance } from "@/lib/similarity";

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

describe("plagiarism — SimHash", () => {
  it("produces same hash for same text", () => {
    const grams = extractNGrams("热解温度对产率的影响", 4);
    const hash1 = computeSimHash(grams);
    const hash2 = computeSimHash(grams);
    expect(hash1).toBe(hash2);
  });

  it("produces small Hamming distance for similar text", () => {
    const a = "热解温度对生物炭产率的影响研究";
    const b = "热解温度对于生物炭产率的影响分析";
    const h1 = computeSimHash(extractNGrams(a, 4));
    const h2 = computeSimHash(extractNGrams(b, 4));
    const dist = hammingDistance(h1, h2);
    // Similar CJK text should have relatively close SimHash
    expect(dist).toBeLessThan(32);
  });

  it("produces large Hamming distance for unrelated text", () => {
    const a = "热解温度对生物炭产率的影响";
    const b = "深度学习模型在图像分类中的应用";
    const h1 = computeSimHash(extractNGrams(a, 4));
    const h2 = computeSimHash(extractNGrams(b, 4));
    const dist = hammingDistance(h1, h2);
    expect(dist).toBeGreaterThan(10);
  });
});
