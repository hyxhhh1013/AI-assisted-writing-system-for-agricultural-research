import { describe, expect, it } from "vitest";
import { isLikelyReferencesText } from "../../../scripts/lib/index-text-filters.mjs";
import { isLikelyReferencesText as runtimeRefs, referencesScoreMultiplier } from "@/lib/rag-chunk-quality";

describe("references page filter", () => {
  it("detects a References page with numbered citations", () => {
    const text = `References
[1] Smith J. Biochar and soil, 2020. doi: 10.1000/abc
[2] Wang Y. Pyrolysis of biomass, 2019. doi: 10.1000/def
[3] Li H. Adsorption of Cd, 2021.
[4] Chen K. Nitrogen cycling, 2018.
[5] Zhao L. Compost amendment, 2017.
[6] Sun Q. Phosphorus uptake, 2016.
[7] Wu P. Potassium fertilizer, 2015.
[8] Zhou B. Controlled release, 2014.
[9] Tang M. Coating materials, 2013.
[10] Gao R. Microbial community, 2012.`;
    expect(isLikelyReferencesText(text, { page: 18, minPage: 3 })).toBe(true);
    expect(runtimeRefs(text, { page: 18, minPage: 3 })).toBe(true);
    expect(referencesScoreMultiplier(text, 18)).toBeLessThan(0.5);
  });

  it("does not flag methods text with a few citations", () => {
    const text =
      "土壤样品风干过筛后测定 pH。处理组添加生物炭 2%（w/w），对照不添加。测定指标包括全氮、有效磷[1] 与钾[2]。每个处理 3 次重复。";
    expect(isLikelyReferencesText(text, { page: 4, minPage: 3 })).toBe(false);
    expect(referencesScoreMultiplier(text, 4)).toBe(1);
  });

  it("does not skip the first two pages even if they look dense", () => {
    const text = `References
[1] A 2020 [2] B 2019 [3] C 2018 [4] D 2017 [5] E 2016
[6] F 2015 [7] G 2014 [8] H 2013 [9] I 2012 [10] J 2011`;
    expect(isLikelyReferencesText(text, { page: 1, minPage: 3 })).toBe(false);
  });
});
