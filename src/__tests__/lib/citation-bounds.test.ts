import { describe, expect, it } from "vitest";
import { normalizeAllCitationFormats } from "@/lib/citation";
import { normalizeCitationBrackets } from "@/lib/citation";

describe("citation bracket normalization", () => {
  it("converts corner brackets 【16, 21】 to [16, 21]", () => {
    const text = "多项研究表明该机制成立【16, 21】，但仍存在争议。";
    expect(normalizeCitationBrackets(text)).toBe(
      "多项研究表明该机制成立[16, 21]，但仍存在争议。",
    );
  });

  it("converts fullwidth brackets ［3］ to [3]", () => {
    expect(normalizeCitationBrackets("结论一致［3］。")).toBe("结论一致[3]。");
  });

  it("does not alter FIGURE markers with corner brackets", () => {
    const fig = "【FIGURE:{\"tool\":\"bar\"}】";
    expect(normalizeCitationBrackets(fig)).toBe(fig);
  });

  it("normalizeAllCitationFormats handles [参考来源16]", () => {
    expect(normalizeAllCitationFormats("见[参考来源16]。")).toBe("见[16]。");
  });

  it("dedupes and sorts citation numbers within a group", () => {
    expect(normalizeAllCitationFormats("[20, 17, 17]")).toBe("[17,20]");
  });

  it("compresses consecutive numbers into a range", () => {
    expect(normalizeAllCitationFormats("[1, 2, 3]")).toBe("[1-3]");
  });

  it("dedupes against a range", () => {
    expect(normalizeAllCitationFormats("[3-5, 5]")).toBe("[3-5]");
  });

  it("normalizeAllCitationFormats unescapes markdown-style \\[n\\]", () => {
    expect(normalizeAllCitationFormats("见\\[11\\]与\\[3,5\\]。")).toBe("见[11]与[3,5]。");
    expect(normalizeAllCitationFormats("仅左逃逸\\[7]与右逃逸[8\\]。")).toBe("仅左逃逸[7]与右逃逸[8]。");
  });
});
