import { describe, expect, it } from "vitest";
import {
  cjkPhraseHits,
  extractCjkPhrases,
  paperPriority,
  restrictOrderToTopPapers,
} from "@/lib/rag-rank";
import { collectWritingClaims, writingClaimQueries } from "@/lib/writing-claims";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import { rerankChunksForClaims } from "@/lib/rag-claim-rerank";
import type { RagChunk } from "@/lib/rag";

describe("extractCjkPhrases", () => {
  it("drops section boilerplate and keeps the longest domain phrase", () => {
    const phrases = extractCjkPhrases("研究背景 热解温度决定钾的迁移 生物炭");
    expect(phrases[0]).toBe("热解温度决定钾的迁移");
    expect(phrases).not.toContain("研究背景");
  });
});

describe("paper-first ranking", () => {
  it("keeps the paper whose title contains the phrase over a higher BM25 review", () => {
    const sources = ["review.pdf", "review.pdf", "target.pdf", "other.pdf"];
    const order = restrictOrderToTopPapers({
      order: [0, 1, 2, 3],
      sources,
      scores: [20, 19, 8, 7],
      paperLimit: 1,
      titlePhraseHits: [0, 0, 1, 0],
      bodyPhraseHits: [0, 0, 0, 0],
    });
    expect(order).toEqual([2]);
    expect(cjkPhraseHits("热解温度升高后钾以碳酸盐形式迁移", ["热解温度"])).toBe(1);
  });

  it("gives recent highly cited papers only a small lift", () => {
    const plain = paperPriority(10, {});
    const lifted = paperPriority(10, { year: 2022, citedBy: 120, impactFactor: 8 });
    expect(lifted).toBeGreaterThan(plain);
    expect(lifted / plain).toBeLessThan(1.25);
  });
});

describe("writing claims", () => {
  it("builds one query per claim for the current section", () => {
    const blueprint = {
      sectionGuides: [
        {
          sectionPath: "引言",
          purpose: "交代背景",
          keyPoints: ["生物炭降低土壤有效态镉"],
          claim: "热解温度决定钾的迁移形态",
        },
        {
          sectionPath: "结论",
          purpose: "收束",
          keyPoints: ["不应进入引言检索的另一条长要点"],
        },
      ],
    } as WritingBlueprint;

    const claims = collectWritingClaims(blueprint, "introduction", "review");
    expect(claims[0]).toBe("热解温度决定钾的迁移形态");
    expect(claims.some((c) => c.includes("结论") || c.includes("不应进入"))).toBe(false);

    const queries = writingClaimQueries({
      title: "秸秆热解中钾的迁移",
      researchDirection: "热化学",
      claims,
    });
    expect(queries[0]).toContain("热解温度决定钾的迁移形态");
    expect(queries[0]).toContain("秸秆热解中钾的迁移");
    expect(queries.length).toBeLessThanOrEqual(3);
  });
});

describe("claim rerank", () => {
  it("keeps the original order in tests", async () => {
    const chunks: RagChunk[] = [0, 1, 2, 3].map((i) => ({
      content: `段落${i} 热解温度`,
      metadata: { source: `p${i}.pdf`, category: "热化学", id: String(i) },
    }));
    const out = await rerankChunksForClaims(chunks, ["热解温度决定钾的迁移形态"]);
    expect(out.map((c) => c.metadata.id)).toEqual(["0", "1", "2", "3"]);
  });
});
