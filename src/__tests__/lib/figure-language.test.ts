import { describe, expect, it } from "vitest";
import { englishFigureTextError } from "@/lib/agent/figure-language";

describe("englishFigureTextError", () => {
  it("英文图里的汉字会被指出", () => {
    const error = englishFigureTextError({
      title: "红外谱图",
      xLabel: "Wavenumber (cm-1)",
    });
    expect(error).toContain("title");
    expect(error).not.toContain("xLabel");
  });

  it("全英文则通过", () => {
    expect(englishFigureTextError({
      title: "FTIR spectra",
      series: "Fe/HZSM-5",
    })).toBeNull();
  });
});
