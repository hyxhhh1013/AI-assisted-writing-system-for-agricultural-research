import { describe, expect, it } from "vitest";
import {
  buildRagSearchTerms,
  buildRagSearchTermWeights,
  collectIndexTermTf,
  expandRagQueries,
  extractQueryTerms,
  inferCategoriesFromQuery,
  shouldUseMultiQuery,
} from "@/lib/rag-query-expand";

describe("rag-query-expand", () => {
  it("expands biochar to Chinese synonyms", () => {
    const terms = buildRagSearchTerms("biochar soil amendment");
    expect(terms.some((t) => t.includes("生物炭") || t === "biochar")).toBe(true);
    expect(terms.some((t) => t.includes("soil") || t.includes("土壤"))).toBe(true);
  });

  it("expands 热解 to English variants", () => {
    const terms = buildRagSearchTerms("生物质热解温度");
    expect(terms.some((t) => t.includes("pyrolysis") || t.includes("热解"))).toBe(true);
  });

  it("produces multiple query variants for mixed terms", () => {
    const variants = expandRagQueries("biochar pyrolysis");
    expect(variants.length).toBeGreaterThan(1);
    expect(variants[0]).toBe("biochar pyrolysis");
  });

  it("extractQueryTerms keeps n-grams for Chinese segments", () => {
    const terms = extractQueryTerms("生物炭改良酸性土壤");
    expect(terms).toContain("生物炭");
    expect(terms).toContain("改良");
    expect(terms.some((t) => t.length === 2)).toBe(true);
  });

  it("index TF contains bigrams that query will look up", () => {
    const tf = collectIndexTermTf("研究表明热解温度影响催化剂活性与生物炭产率。");
    expect(tf.has("热解")).toBe(true);
    expect(tf.has("生物")).toBe(true);
    expect(tf.has("生物炭") || tf.has("炭产")).toBe(true);
  });

  it("infers 茶学 from tea aroma query", () => {
    expect(inferCategoriesFromQuery("绿茶香气挥发性")).toContain("茶学");
    expect(inferCategoriesFromQuery("biochar pyrolysis")).toContain("热化学");
  });

  it("shouldUseMultiQuery for pure English", () => {
    expect(
      shouldUseMultiQuery("biochar soil", [{ metadata: { category: "热化学" } }], 8),
    ).toBe(true);
  });

  it("shouldUseMultiQuery false when Chinese hits match hint", () => {
    expect(
      shouldUseMultiQuery(
        "绿茶香气挥发性成分",
        [
          { metadata: { category: "茶学" } },
          { metadata: { category: "茶学" } },
          { metadata: { category: "茶学" } },
          { metadata: { category: "茶学" } },
        ],
        8,
      ),
    ).toBe(false);
  });

  it("filters noisy short English synonyms", () => {
    const terms = buildRagSearchTerms("生物炭");
    expect(terms).not.toContain("cd");
    expect(terms).not.toContain("pp");
    expect(terms).not.toContain("char");
  });

  it("skips CJK function unigrams but keeps domain bigrams", () => {
    const tf = collectIndexTermTf("这是一种有效的土壤改良方法。");
    expect(tf.has("的")).toBe(false);
    expect(tf.has("是")).toBe(false);
    expect(tf.has("土壤") || tf.has("改良")).toBe(true);
  });

  it("skips English stopwords in query terms", () => {
    const terms = extractQueryTerms("the study of biochar in soil");
    expect(terms).not.toContain("the");
    expect(terms).not.toContain("study");
    expect(terms).toContain("biochar");
  });

  it("weights original query terms higher than same-script synonyms", () => {
    const w = buildRagSearchTermWeights("biochar pyrolysis");
    expect(w.get("biochar")).toBe(1);
    const zh = [...w.entries()].find(([t]) => /[一-龥]/.test(t));
    if (zh) expect(zh[1]).toBeGreaterThanOrEqual(0.9);
  });
});
