import { describe, expect, it } from "vitest";
import { applyAcceptedRewritesToContent } from "@/lib/plagiarism-utils";
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
