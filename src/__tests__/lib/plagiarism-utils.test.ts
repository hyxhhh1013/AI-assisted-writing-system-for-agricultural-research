import { describe, expect, it } from "vitest";
import { applyAcceptedRewritesToContent, applyAcceptedRewritesToSections, humanizeClichePattern, placeMatchesInContent, presentMatchDetail, splitContentByMatches } from "@/lib/plagiarism-utils";
import type { QualitySection } from "@/lib/quality-sections";
import type { PlagiarismMatchResult, RewriteSuggestion } from "@/contracts/plagiarism";

const match = (overrides: Partial<PlagiarismMatchResult>): PlagiarismMatchResult => ({
  id: "m1",
  sourceText: "原文段落A",
  sourceOffset: 0,
  matchType: "self",
  matchedText: "重复",
  matchedFrom: "本文",
  similarity: 0.5,
  riskLevel: "high",
  ...overrides,
});

describe("applyAcceptedRewritesToContent", () => {
  it("replaces accepted segments inside full content", () => {
    const content = "前言\n\n原文段落A\n\n结尾";
    const suggestions: Record<string, RewriteSuggestion[]> = {
      m1: [{ strategy: "rephrase", suggestedText: "改写段落A", id: "s1" }],
    };
    const accepted = { "m1-rephrase": true };

    const next = applyAcceptedRewritesToContent(content, [match({})], suggestions, accepted);
    expect(next).toBe("前言\n\n改写段落A\n\n结尾");
  });

  it("leaves content unchanged when nothing accepted", () => {
    const content = "原文段落A";
    const next = applyAcceptedRewritesToContent(content, [match({})], {}, {});
    expect(next).toBe(content);
  });
});

describe("applyAcceptedRewritesToSections", () => {
  const sections: QualitySection[] = [
    { key: "intro", title: "引言", content: "原文段落A在这里", wordCount: 8 },
    { key: "methods", title: "方法", content: "方法段", wordCount: 3 },
  ];

  it("updates only sections containing accepted match", () => {
    const suggestions = { m1: [{ strategy: "rephrase", suggestedText: "改写段落A", id: "s1" }] };
    const accepted = { "m1-rephrase": true };
    const { sections: next, changedKeys } = applyAcceptedRewritesToSections(
      sections,
      [match({ sourceText: "原文段落A" })],
      suggestions,
      accepted,
    );
    expect(changedKeys).toEqual(["intro"]);
    expect(next[0]?.content).toContain("改写段落A");
    expect(next[1]?.content).toBe("方法段");
  });
});

describe("splitContentByMatches", () => {
  it("splits content around match source text", () => {
    const parts = splitContentByMatches("前文原文段落A后文", [
      match({ sourceText: "原文段落A", similarity: 0.8 }),
    ]);
    expect(parts.some((p) => p.match?.sourceText === "原文段落A")).toBe(true);
  });
});

describe("placeMatchesInContent", () => {
  it("paints the offset occurrence when the same sentence appears twice", () => {
    const sentence = "同一句。";
    const content = `${sentence}中间。${sentence}`;
    const offset = content.lastIndexOf(sentence);
    const placed = placeMatchesInContent(content, [
      match({
        sourceText: sentence,
        sourceOffset: offset,
        sourceLength: sentence.length,
      }),
    ]);
    expect(placed.unplaced).toHaveLength(0);
    const marked = placed.parts.filter((part) => part.match);
    expect(marked).toHaveLength(1);
    expect(marked[0]?.text).toBe(sentence);
    const before = placed.parts.slice(0, placed.parts.findIndex((part) => part.match)).map((part) => part.text).join("");
    expect(before.startsWith(sentence)).toBe(true);
    expect(before.endsWith("中间。")).toBe(true);
  });

  it("puts zero-length style comments that are absent from the text into unplaced", () => {
    const placed = placeMatchesInContent("正文开头是实验描述。", [
      match({
        id: "ai-1",
        matchType: "ai",
        sourceText: "【AI 评估】套话偏多",
        sourceOffset: 0,
        sourceLength: 0,
        riskLevel: "low",
      }),
    ]);
    expect(placed.unplaced.map((item) => item.id)).toEqual(["ai-1"]);
    expect(placed.parts.some((part) => part.match)).toBe(false);
    expect(placed.parts.map((part) => part.text).join("")).toBe("正文开头是实验描述。");
  });

  it("does not throw when the offset is outside the text", () => {
    const content = "这里有正确原句。";
    expect(() => placeMatchesInContent(content, [
      match({
        sourceText: "正确原句",
        sourceOffset: 9999,
        sourceLength: 8,
      }),
    ])).not.toThrow();
    const placed = placeMatchesInContent(content, [
      match({
        sourceText: "正确原句",
        sourceOffset: 9999,
        sourceLength: 8,
      }),
    ]);
    expect(placed.parts.some((part) => part.text === "正确原句" && part.match)).toBe(true);
  });

  it("falls back to text search when the offset slice disagrees with the source", () => {
    const content = "AAA正确原句BBB";
    const placed = placeMatchesInContent(content, [
      match({
        sourceText: "正确原句",
        sourceOffset: 0,
        sourceLength: 3,
      }),
    ]);
    expect(placed.parts.find((part) => part.match)?.text).toBe("正确原句");
    expect(placed.parts[0]?.text).toBe("AAA");
  });

  it("lets the higher-risk span keep the color when two hits overlap", () => {
    const content = "重复的原句在这里";
    const placed = placeMatchesInContent(content, [
      match({ id: "low", sourceText: "重复的原句", sourceOffset: 0, sourceLength: 5, riskLevel: "low", similarity: 0.9 }),
      match({ id: "high", sourceText: "重复的原句", sourceOffset: 0, sourceLength: 5, riskLevel: "high", similarity: 0.4 }),
    ]);
    expect(placed.parts.find((part) => part.match)?.match?.id).toBe("high");
    expect(placed.unplaced).toHaveLength(0);
  });
});

describe("humanizeClichePattern", () => {
  it("turns stored regex fragments into readable phrases", () => {
    expect(humanizeClichePattern("近年来[^。]{3,60}")).toBe("近年来…");
    expect(humanizeClichePattern("(研究|实验|实践)表明[^。]{5,60}")).toBe("研究/实验/实践表明…");
    expect(presentMatchDetail('"近年来[^。]{3,60}" 出现 2 次')).toBe("「近年来…」 出现 2 次");
  });
});
