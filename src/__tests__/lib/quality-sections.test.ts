import { describe, expect, it } from "vitest";
import { buildCheckContentFromSections, buildQualitySections, resolveIssueSectionKey } from "@/lib/quality-sections";

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
});
