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
});
