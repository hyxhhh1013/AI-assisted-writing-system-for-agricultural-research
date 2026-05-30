import { describe, it, expect } from "vitest";
import { validateCitations, validateDataClaims } from "@/lib/citation-validator";

// ==================== validateCitations ====================

describe("validateCitations", () => {
  it("returns empty array for empty draft text", () => {
    const results = validateCitations("", "some context");
    expect(results).toEqual([]);
  });

  it("returns empty array for empty context text", () => {
    const results = validateCitations("[1] some claim", "");
    expect(results).toEqual([]);
  });

  it("returns empty array when no citations present", () => {
    const results = validateCitations("plain text without any citations", "some context");
    expect(results).toEqual([]);
  });

  it("detects citations and calculates overlap", () => {
    const draft = "研究表明催化剂活性显著提高[1]。";
    const context = "催化剂活性提高\n作者发现煅烧温度对催化活性有显著影响，活性提高了约30%。";
    const results = validateCitations(draft, context);
    expect(results).toHaveLength(1);
    expect(results[0].number).toBe(1);
    expect(results[0].overlap).toBeGreaterThan(0);
  });

  it("deduplicates repeated citation numbers", () => {
    const draft = "催化剂活性提高[1]，反应效率提升[1]。";
    const context = "催化剂活性研究\n本文探讨了催化剂的活性优化方法。";
    const results = validateCitations(draft, context);
    // [1] appears twice but should only produce one result
    expect(results.filter((r) => r.number === 1)).toHaveLength(1);
  });

  it("passes when overlap meets threshold", () => {
    const draft = "催化剂活性显著提高，选择性优异";
    const context = "催化剂活性提高 选择性优异\n本研究探讨了催化剂活性与选择性的优化。";
    const results = validateCitations(`[1] ${draft}`, context);
    expect(results[0].passed).toBe(true);
  });

  it("fails when overlap is below threshold", () => {
    const draft = "量子计算在材料科学中有广泛应用前景";
    const context = "催化剂活性研究\n本文探讨了催化剂的活性优化方法。";
    const results = validateCitations(`[1] ${draft}`, context);
    // Completely unrelated topics should fail
    expect(results[0].overlap).toBeLessThan(0.08);
    expect(results[0].passed).toBe(false);
  });

  it("handles multiple citations", () => {
    const draft = "催化剂活性提高[1]，有机合成产率提升[2]。";
    const context =
      "催化剂活性提高\n本研究探讨了催化剂的活性优化方法。\n\n有机合成产率提升\n本研究改进了合成路线，产率显著提升。";
    const results = validateCitations(draft, context);
    expect(results).toHaveLength(2);
  });

  it("passes when draft has no extractable terms", () => {
    const draft = "[1] ...";
    const context = "some irrelevant context here";
    const results = validateCitations(draft, context);
    expect(results).toHaveLength(1);
    expect(results[0].passed).toBe(true); // no terms means automatic pass
  });
});

// ==================== validateDataClaims ====================

describe("validateDataClaims", () => {
  const sampleClaims: { id: string; text: string; values: Record<string, number>; tolerance: number }[] = [
    {
      id: "claim-1",
      text: "煅烧温度 800°C 时产率最高",
      values: { yield: 92.5 },
      tolerance: 0.1,
    },
    {
      id: "claim-2",
      text: "pH=7 时吸附量最大",
      values: { adsorption: 45.3 },
      tolerance: 0.1,
    },
  ];

  it("returns empty array for empty claims", () => {
    const results = validateDataClaims("some text", []);
    expect(results).toEqual([]);
  });

  it("detects when claim ID is found in text", () => {
    const text = "根据实验数据[claim-1]，煅烧温度对产率有显著影响。";
    const results = validateDataClaims(text, sampleClaims.slice(0, 1));
    expect(results).toHaveLength(1);
    expect(results[0].found).toBe(true);
  });

  it("detects when claim ID is NOT found in text", () => {
    const text = "实验结果表明煅烧温度对产率有显著影响。";
    const results = validateDataClaims(text, sampleClaims.slice(0, 1));
    expect(results[0].found).toBe(false);
    expect(results[0].issue).toBeDefined();
  });

  it("verifies numeric values near citation", () => {
    const text = "根据实验数据[claim-1]，产率达到 92.5%。";
    const results = validateDataClaims(text, sampleClaims.slice(0, 1));
    expect(results[0].citedCorrectly).toBe(true);
  });

  it("flags when numeric value does not match", () => {
    const text = "根据实验数据[claim-1]，产率达到 85.0%。";
    const results = validateDataClaims(text, sampleClaims.slice(0, 1));
    expect(results[0].citedCorrectly).toBe(false);
    expect(results[0].issue).toContain("yield");
  });

  it("handles multiple claims", () => {
    const text = "数据[claim-1]显示产率92.5，[claim-2]显示吸附量45.3。";
    const results = validateDataClaims(text, sampleClaims);
    expect(results).toHaveLength(2);
    expect(results[0].citedCorrectly).toBe(true);
    expect(results[1].citedCorrectly).toBe(true);
  });

  it("skips non-numeric values in claim validation", () => {
    const claims = [
      { id: "c1", text: "test", values: { name: "something" }, tolerance: 0.1 },
    ];
    const text = "[c1] this is a test claim";
    const results = validateDataClaims(text, claims);
    expect(results[0].found).toBe(true);
    expect(results[0].citedCorrectly).toBe(true); // non-numeric → no validation needed
  });
});
