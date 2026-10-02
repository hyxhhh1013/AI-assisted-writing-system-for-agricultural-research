import { describe, expect, it } from "vitest";
import type { RagChunk } from "@/lib/rag";
import {
  composeKnowledgeSearchQuery,
  rankKnowledgePapers,
  suggestedKnowledgeIndices,
} from "@/lib/agent/knowledge-search-rank";

function chunk(source: string, content: string, category = "热化学"): RagChunk {
  return {
    content,
    metadata: {
      source,
      category,
      id: `${source}:0`,
      chunkIndex: 0,
    },
  };
}

describe("composeKnowledgeSearchQuery", () => {
  it("把题目叠进过宽的 query", () => {
    const q = composeKnowledgeSearchQuery("综述 文献", "生物质热解制备生物油", "生物质热解");
    expect(q).toMatch(/热解/);
    expect(q).toContain("综述");
  });

  it("query 已含题目时不重复堆砌", () => {
    const q = composeKnowledgeSearchQuery(
      "生物质热解 生物油",
      "生物质热解制备生物油",
      "生物质热解",
    );
    expect(q).toBe("生物质热解 生物油");
  });
});

describe("rankKnowledgePapers", () => {
  it("按篇去重：同一 PDF 多片段只占一篇", () => {
    const ranked = rankKnowledgePapers(
      [
        chunk("pyrolysis-bio-oil.pdf", "biomass pyrolysis bio-oil yield"),
        chunk("pyrolysis-bio-oil.pdf", "reactor temperature 500 C"),
        chunk("pyrolysis-bio-oil.pdf", "another chunk about pyrolysis oil"),
        chunk("tea-aroma.pdf", "tea aroma volatile coating"),
      ],
      "biomass pyrolysis bio-oil",
    );
    expect(ranked.filter((p) => p.source.includes("pyrolysis-bio-oil"))).toHaveLength(1);
    expect(ranked[0]?.source).toMatch(/pyrolysis-bio-oil/);
  });

  it("题名相关的篇排在仅方法段命中的篇前面", () => {
    const ranked = rankKnowledgePapers(
      [
        chunk("generic-methods.pdf", "samples were dried at 105 C and treated"),
        chunk("biomass-pyrolysis-bio-oil.pdf", "this paper studies biomass pyrolysis to bio-oil"),
      ],
      "biomass pyrolysis bio-oil",
    );
    expect(ranked[0]?.source).toMatch(/biomass-pyrolysis-bio-oil/);
  });

  it("制炭查询时把缓释肥/催化篇往后排", () => {
    const ranked = rankKnowledgePapers(
      [
        chunk("生物质膨润土共热解制备生物炭基缓释肥.pdf", "biochar based slow release fertilizer pyrolysis"),
        chunk("镍基生物炭催化剂活性.pdf", "nickel catalyst supported on biochar"),
        chunk("热解温度影响稻秆稻壳生物炭性质.pdf", "pyrolysis temperature rice straw biochar properties"),
      ],
      "生物质热解制炭 生物炭 热解温度 理化性质",
    );
    expect(ranked[0]?.source).toMatch(/热解温度/);
  });

  it("建议导入只含相关篇", () => {
    const idx = suggestedKnowledgeIndices([
      { relevanceScore: 0.6 },
      { relevanceScore: 0.4 },
      { relevanceScore: 0.02 },
      { relevanceScore: 0.5 },
      { relevanceScore: 0.3 },
    ]);
    expect(idx).toEqual([1, 2, 4, 5]);
    expect(idx).not.toContain(3);
  });
});
