import { describe, expect, it } from "vitest";
import { buildCheckContentFromSections, buildQualitySections, locateReviewIssue, resolveIssueSectionKey, sectionHitCounts } from "@/lib/quality-sections";

describe("quality-sections", () => {
  it("builds sections from project", () => {
    const sections = buildQualitySections({
      mode: "research",
      abstract: "摘要内容",
      sections: { introduction: "引言正文", methods: "方法正文" },
    });
    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some((s) => s.key === "abstract")).toBe(true);
  });

  it("buildCheckContentFromSections scopes to single chapter", () => {
    const sections = [
      { key: "a", title: "摘要", content: "AAA", wordCount: 3 },
      { key: "b", title: "引言", content: "BBB", wordCount: 3 },
    ];
    const full = buildCheckContentFromSections(sections, "full");
    expect(full).toContain("摘要");
    expect(full).toContain("引言");
    const one = buildCheckContentFromSections(sections, "b");
    expect(one).toContain("引言");
    expect(one).not.toContain("AAA");
  });

  it("resolveIssueSectionKey matches title, ordinal, and original snippet", () => {
    const sections = [
      { key: "abstract", title: "摘要", content: "这段摘要讲产量" },
      { key: "introduction", title: "引言", content: "本研究探讨氮肥" },
    ];
    expect(resolveIssueSectionKey({ location: "引言 / 第2段" }, sections)).toBe("introduction");
    expect(resolveIssueSectionKey({ location: "第1节" }, sections)).toBe("abstract");
    expect(resolveIssueSectionKey({ location: "正文某处", originalText: "本研究探讨氮肥" }, sections)).toBe("introduction");
    expect(resolveIssueSectionKey({ location: "未知" }, sections)).toBeNull();
  });

  it("locateReviewIssue pins the quote to the later chapter, not an earlier short overlap", () => {
    const sections = [
      { key: "introduction", title: "引言", content: "氮肥很重要", wordCount: 5 },
      { key: "methods", title: "方法", content: "本研究探讨氮肥的具体方案", wordCount: 12 },
    ];
    const content = buildCheckContentFromSections(sections, "full");
    const anchor = locateReviewIssue(content, sections, {
      location: "未知",
      originalText: "本研究探讨氮肥的具体方案",
    });
    expect(anchor).toEqual({
      sectionKey: "methods",
      placed: true,
      offset: content.indexOf("本研究探讨氮肥的具体方案"),
      length: "本研究探讨氮肥的具体方案".length,
    });
    expect(anchor && anchor.placed && anchor.offset).toBeGreaterThan(content.indexOf("方法"));
  });

  it("locateReviewIssue keeps a chapter hint unplaced when there is no quote", () => {
    const sections = [
      { key: "introduction", title: "引言", content: "引言正文足够长", wordCount: 7 },
    ];
    const content = buildCheckContentFromSections(sections, "full");
    expect(locateReviewIssue(content, sections, { location: "引言" })).toEqual({
      sectionKey: "introduction",
      placed: false,
    });
  });

  it("sectionHitCounts attributes a literal hit to the chapter that contains its offset", () => {
    const sections = [
      { key: "a", title: "摘要", content: "AAA", wordCount: 3 },
      { key: "b", title: "引言", content: "生物炭产率下降", wordCount: 7 },
    ];
    const content = buildCheckContentFromSections(sections, "full");
    const counts = sectionHitCounts(sections, content, [
      {
        sourceOffset: content.indexOf("生物炭产率下降"),
        matchType: "local",
        riskLevel: "high",
      },
      { sourceOffset: 0, matchType: "ai", riskLevel: "low" },
    ]);
    expect(counts?.b).toEqual({ count: 1, worst: "high" });
    expect(counts?.a.count).toBe(0);
    expect(sectionHitCounts(sections, "不是拼出来的全文", [])).toBeNull();
  });

  it("locateReviewIssue returns null when nothing matches", () => {
    const sections = [
      { key: "introduction", title: "引言", content: "引言正文足够长", wordCount: 7 },
    ];
    expect(locateReviewIssue("引言正文足够长", sections, { location: "火星章节" })).toBeNull();
    expect(() => locateReviewIssue("", [], { location: "" })).not.toThrow();
  });
});
