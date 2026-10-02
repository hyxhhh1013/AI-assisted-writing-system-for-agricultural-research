import { describe, expect, it } from "vitest";
import type { RagChunk } from "@/lib/rag";
import {
  composeKnowledgeSearchQuery,
  rankKnowledgePapers,
  rankKnowledgePapersDetailed,
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

  it("不把占位题名叠进 query", () => {
    expect(composeKnowledgeSearchQuery("热解", "新文献综述", "")).toBe("热解");
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

  it("单字分类词在整库都出现时判过宽，限定词能把对口篇提前", () => {
    const pool = [
      chunk("中草药残渣与聚乙烯共热解产物分布.pdf", "co-pyrolysis plastics"),
      chunk("镍基催化剂催化热解中药渣.pdf", "catalytic pyrolysis nickel"),
      chunk("茶树壳氧化固化热解产物.pdf", "camellia shell pyrolysis"),
      chunk("纱布药瓶共热解炭油气体.pdf", "gauze bottle co-pyrolysis"),
      chunk("废轮胎粘土催化热解.pdf", "waste tire catalytic pyrolysis"),
      chunk("热解温度影响稻秆稻壳生物炭性质.pdf", "pyrolysis temperature rice straw biochar"),
    ];
    const broad = rankKnowledgePapersDetailed(pool, "热解");
    expect(broad.topicTooBroad).toBe(true);
    const narrow = rankKnowledgePapersDetailed(pool, "热解温度 预处理 理化性质");
    expect(narrow.papers[0]?.source).toMatch(/热解温度/);
    expect(suggestedKnowledgeIndices(broad.papers, true).length).toBeLessThanOrEqual(5);
  });

  it("题目限定词会把共热解/CNT 篇压到温度—性质篇之后", () => {
    const ranked = rankKnowledgePapers(
      [
        chunk("中草药残渣与聚丙烯共热解碳纳米管.pdf", "co-pyrolysis polypropylene carbon nanotubes"),
        chunk("热解温度影响稻秆稻壳生物炭性质.pdf", "pyrolysis temperature rice straw husk biochar properties"),
      ],
      "热解",
      "热解温度与预处理对生物炭理化性质的影响研究进展",
    );
    expect(ranked[0]?.source).toMatch(/热解温度/);
  });

  it("建议导入只保留相对高分篇", () => {
    const idx = suggestedKnowledgeIndices([
      { relevanceScore: 0.9 },
      { relevanceScore: 0.85 },
      { relevanceScore: 0.2 },
      { relevanceScore: 0.88 },
    ]);
    expect(idx).toEqual([1, 2, 4]);
    expect(idx).not.toContain(3);
  });
});
