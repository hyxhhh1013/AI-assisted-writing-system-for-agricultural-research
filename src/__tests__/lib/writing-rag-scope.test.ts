import { describe, expect, it } from "vitest";
import {
  buildWritingRefRangeHint,
  extractTopicTerms,
  filterChunksByTopicRelevance,
  mergeScopeSourceKeys,
  scoreChunkTopicRelevance,
  shouldSkipKnowledgeRag,
  toRagSearchScope,
} from "@/services/writing-context";
import type { RagChunk } from "@/lib/rag";
import {
  resolveAllowedCitationIndices,
  stripDisallowedCitations,
  stripOutOfRangeCitations,
} from "@/lib/reference-reorder";

function chunk(source: string, content: string): RagChunk {
  return {
    content,
    metadata: { source, category: "测试", id: source },
  };
}

describe("mergeScopeSourceKeys", () => {
  it("unions existing refs and selected sources", () => {
    expect(
      mergeScopeSourceKeys(["a.pdf", "b.pdf"], ["b.pdf", "c.pdf"]).sort(),
    ).toEqual(["a.pdf", "b.pdf", "c.pdf"]);
  });

  it("ignores selectedSourceIds when undefined", () => {
    expect(mergeScopeSourceKeys(["a.pdf"], undefined)).toEqual(["a.pdf"]);
  });

  it("keeps only existing when selection is empty array", () => {
    expect(mergeScopeSourceKeys(["a.pdf"], [])).toEqual(["a.pdf"]);
  });
});

describe("toRagSearchScope", () => {
  it("maps 0/1/many categories", () => {
    expect(toRagSearchScope([])).toEqual({});
    expect(toRagSearchScope(["茶学"])).toEqual({ category: "茶学" });
    expect(toRagSearchScope(["茶学", "烟草"])).toEqual({ categories: ["茶学", "烟草"] });
  });
});

describe("inferCategoriesFromTitle", () => {
  it("maps tea aroma title to 茶学", async () => {
    const { inferCategoriesFromTitle, resolveWritingSearchScope } = await import(
      "@/services/writing-context"
    );
    expect(inferCategoriesFromTitle("绿茶香气品质形成机制及关键挥发性成分研究进展")).toEqual([
      "茶学",
    ]);
    expect(
      resolveWritingSearchScope({
        title: "绿茶香气品质形成机制及关键挥发性成分研究进展",
      }),
    ).toEqual({ category: "茶学" });
  });
});

describe("topic relevance filter", () => {
  it("extractTopicTerms keeps domain nouns from title", () => {
    const terms = extractTopicTerms("小麦抗旱生理机制与节水栽培技术研究进展");
    expect(terms.some((t) => t.includes("小麦"))).toBe(true);
    expect(terms.some((t) => t.includes("抗旱") || t.includes("节水"))).toBe(true);
    expect(terms).not.toContain("研究");
  });

  it("scores filename hits higher than content-only", () => {
    const terms = ["小麦", "抗旱"];
    const byName = scoreChunkTopicRelevance(chunk("小麦抗旱.pdf", "一般讨论"), terms);
    const byBody = scoreChunkTopicRelevance(chunk("生物炭.pdf", "提到小麦抗旱响应"), terms);
    expect(byName).toBeGreaterThan(byBody);
  });

  it("drops off-topic chunks while pinning existing refs", () => {
    const terms = extractTopicTerms("小麦抗旱生理");
    const chunks = [
      chunk("生物炭烤烟.pdf", "烤烟生物炭施用效果"),
      chunk("小麦干旱胁迫.pdf", "小麦叶片气孔导度下降，抗旱生理响应明显"),
      chunk("已有文献.pdf", "完全无关内容"),
    ];
    const { chunks: kept } = filterChunksByTopicRelevance(chunks, terms, {
      pinSources: ["已有文献.pdf"],
      keepAtLeast: 2,
    });
    expect(kept.some((c) => c.metadata.source === "小麦干旱胁迫.pdf")).toBe(true);
    expect(kept.some((c) => c.metadata.source === "已有文献.pdf")).toBe(true);
    expect(kept.some((c) => c.metadata.source === "生物炭烤烟.pdf")).toBe(false);
  });
});

describe("buildWritingRefRangeHint", () => {
  it("separates grounded vs bibliography-only refs", () => {
    const hint = buildWritingRefRangeHint({
      referencesByIndex: ["a.pdf", "b.pdf", "c.pdf"],
      groundedRefIndices: [1, 3],
    });
    expect(hint).toMatch(/可深度引用/);
    expect(hint).toMatch(/\[1\][\s\S]*\[3\]/);
    expect(hint).toMatch(/仅书目/);
    expect(hint).toMatch(/★有全文/);
  });

  it("notes full-library expansion", () => {
    const hint = buildWritingRefRangeHint({
      referencesByIndex: ["a.pdf"],
      groundedRefIndices: [1],
      expandedToFullLibrary: true,
    });
    expect(hint).toMatch(/扩大到全库/);
  });
});

describe("stripDisallowedCitations / grounded allow-list", () => {
  it("keeps only grounded indices", () => {
    const allowed = resolveAllowedCitationIndices(5, [1, 3]);
    const out = stripDisallowedCitations("据报道[1]与[2]及[3-4]。", allowed);
    expect(out).toBe("据报道[1]与及。");
  });

  it("empty grounded array disallows all citations", () => {
    const allowed = resolveAllowedCitationIndices(5, []);
    expect(allowed.size).toBe(0);
    expect(stripDisallowedCitations("见[1]与[2]。", allowed)).toBe("见与。");
  });

  it("undefined grounded falls back to 1..refCount", () => {
    const allowed = resolveAllowedCitationIndices(2, undefined);
    expect([...allowed].sort()).toEqual([1, 2]);
  });

  it("stripOutOfRangeCitations still allows 1..N", () => {
    expect(stripOutOfRangeCitations("见[1][2][9]", 2)).toBe("见[1][2]");
  });
});

describe("shouldSkipKnowledgeRag (W3-AP-WRITE-NO-RAG)", () => {
  const longAbs = "摘要".repeat(50); // >= 80 chars

  it("skips when soft-groundable abstracts exist", () => {
    expect(
      shouldSkipKnowledgeRag({
        referenceEvidence: [{ index: 1, abstract: longAbs }],
        forceKnowledgeRag: false,
        skipKnowledgeRagDisabled: false,
      }),
    ).toBe(true);
  });

  it("does not skip when user selected knowledge sources", () => {
    expect(
      shouldSkipKnowledgeRag({
        referenceEvidence: [{ index: 1, abstract: longAbs }],
        selectedSourceIds: ["paper.pdf"],
        forceKnowledgeRag: false,
        skipKnowledgeRagDisabled: false,
      }),
    ).toBe(false);
  });

  it("does not skip when forceKnowledgeRag", () => {
    expect(
      shouldSkipKnowledgeRag({
        referenceEvidence: [{ index: 1, abstract: longAbs }],
        forceKnowledgeRag: true,
      }),
    ).toBe(false);
  });

  it("does not skip when abstracts too short", () => {
    expect(
      shouldSkipKnowledgeRag({
        referenceEvidence: [{ index: 1, abstract: "太短" }],
        forceKnowledgeRag: false,
        skipKnowledgeRagDisabled: false,
      }),
    ).toBe(false);
  });
});
