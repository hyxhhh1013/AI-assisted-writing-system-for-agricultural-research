import { describe, expect, it } from "vitest";
import {
  canonicalizeLiteratureDoi,
  isNonCitableLiteratureHit,
  literatureMergeKey,
} from "@/lib/literature-hit-quality";

describe("literature-hit-quality", () => {
  it("canonicalizes RSC referee DOI suffixes to the article DOI", () => {
    expect(canonicalizeLiteratureDoi("10.1039/d5gc02932e/v2/review1")).toBe(
      "10.1039/d5gc02932e",
    );
    expect(canonicalizeLiteratureDoi("https://doi.org/10.1039/d5gc02932e/v3/review1")).toBe(
      "10.1039/d5gc02932e",
    );
  });

  it("flags Review for / peer-review DOI as non-citable", () => {
    expect(
      isNonCitableLiteratureHit({
        title:
          'Review for "Unveiling the Five Membered Ring Structures in Soft Coke"',
        doi: "10.1039/d5gc02932e/v2/review2",
      }),
    ).toBe(true);
    expect(
      isNonCitableLiteratureHit({
        title: "Study on regeneration of Fe Ni Ca/Al2O3",
        doi: "10.1016/j.jaap.2023.106041",
      }),
    ).toBe(false);
  });

  it("merges review DOIs onto the same key as the article", () => {
    expect(
      literatureMergeKey({
        title: "Review for \"Same Paper\"",
        doi: "10.1039/d5gc02932e/v2/review1",
      }),
    ).toBe("doi:10.1039/d5gc02932e");
  });
});
