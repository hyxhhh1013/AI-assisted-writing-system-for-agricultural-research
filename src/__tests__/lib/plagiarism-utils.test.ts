import { describe, expect, it } from "vitest";
import { applyAcceptedRewritesToContent, applyAcceptedRewritesToSections, splitContentByMatches } from "@/lib/plagiarism-utils";
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
