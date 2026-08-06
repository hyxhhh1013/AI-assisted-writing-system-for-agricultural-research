import { describe, expect, it } from "vitest";
import { stripEmbeddedBibliography } from "@/lib/reference-reorder";

describe("stripEmbeddedBibliography", () => {
  it("removes trailing 参考文献 block after ---", () => {
    const text = [
      "生物炭可改善土壤结构[1, 2]。",
      "",
      "---",
      "",
      "**参考文献**",
      "[1] Mukherjee A, Lal R. Biochar Impacts[J]. Agronomy, 2013.",
      "[2] Jeffery S. Meta-analysis[J]. Geoderma, 2014.",
    ].join("\n");
    expect(stripEmbeddedBibliography(text)).toBe("生物炭可改善土壤结构[1, 2]。");
  });

  it("removes References heading block", () => {
    const text = "Claim holds [3].\n\n## References\n[3] Smith A. Title. 2020.";
    expect(stripEmbeddedBibliography(text)).toBe("Claim holds [3].");
  });

  it("strips 文献待补充 placeholders", () => {
    expect(stripEmbeddedBibliography("尚待深入研究 [文献待补充]。")).toBe(
      "尚待深入研究。",
    );
  });

  it("keeps body when no bibliography", () => {
    const text = "第一段[1]。\n\n第二段[2]。";
    expect(stripEmbeddedBibliography(text)).toBe(text);
  });
});
