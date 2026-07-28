import { describe, expect, it } from "vitest";
import {
  MIN_IMPORT_RELEVANCE,
  enrichImportReferenceParams,
  isRelevanceAcceptable,
  scoreLiteratureRelevance,
} from "@/lib/agent/literature-relevance";

describe("literature relevance", () => {
  it("scores title keyword hits higher", () => {
    const hit = {
      title: "Biochar amendment improves soil fertility",
      journal: "Soil Biology",
      doi: "10.1/x",
    };
    const good = scoreLiteratureRelevance("biochar soil", hit);
    const bad = scoreLiteratureRelevance("quantum computing qubits", hit);
    expect(good.score).toBeGreaterThan(bad.score);
    expect(good.matchedTokens.length).toBeGreaterThan(0);
    expect(good.why).toMatch(/命中/);
  });

  it("DOI query gets perfect score", () => {
    const rel = scoreLiteratureRelevance("10.1234/abc", {
      title: "Anything",
      doi: "10.1234/abc",
    });
    expect(rel.score).toBe(1);
  });

  it("rejects low score without why", () => {
    expect(isRelevanceAcceptable(0.05, { hasWhy: false })).toBe(false);
    expect(isRelevanceAcceptable(0.05, { hasWhy: true })).toBe(true);
    expect(isRelevanceAcceptable(MIN_IMPORT_RELEVANCE, { hasWhy: false })).toBe(true);
  });

  it("enrichImportReferenceParams fills autoWhy and score, not fake why", () => {
    const hitJson = JSON.stringify({
      id: "1",
      title: "Drought stress in maize",
      authors: ["A"],
      source: "openalex",
    });
    const enriched = enrichImportReferenceParams({
      hitJson,
      query: "maize drought",
    });
    expect(String(enriched.why ?? "")).toBe("");
    expect(String(enriched.autoWhy).length).toBeGreaterThanOrEqual(8);
    expect(typeof enriched.relevanceScore).toBe("number");
  });

  it("enrich keeps explicit why ≥8 chars", () => {
    const hitJson = JSON.stringify({
      id: "1",
      title: "Drought stress in maize",
      authors: ["A"],
      source: "openalex",
    });
    const enriched = enrichImportReferenceParams({
      hitJson,
      query: "maize drought",
      why: "与生物炭改良土壤综述直接相关，拟作对比",
    });
    expect(String(enriched.why)).toMatch(/生物炭/);
  });
});
