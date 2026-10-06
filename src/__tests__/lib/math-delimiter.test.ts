import { describe, expect, it } from "vitest";
import { normalizeMathDelimiters } from "@/lib/math-delimiter";

describe("normalizeMathDelimiters", () => {
  it("keeps an already delimited formula intact", () => {
    const src = "产率 $Y_{bio-oil} = \\frac{m}{m_0} \\times 100\\%$ 见[1]";
    expect(normalizeMathDelimiters(src)).toBe(src);
  });

  it("wraps plain chemical formulas without splitting H2O", () => {
    expect(normalizeMathDelimiters("热解放出 CO2、H2O 与 Fe2O3")).toBe(
      "热解放出 $\\mathrm{CO_{2}}$、$\\mathrm{H_{2}O}$ 与 $\\mathrm{Fe_{2}O_{3}}$",
    );
    expect(normalizeMathDelimiters("生物炭释放 H_2O 与 CO_2")).toBe(
      "生物炭释放 $\\mathrm{H_{2}O}$ 与 $\\mathrm{CO_{2}}$",
    );
  });

  it("puts ion charges on the superscript and keeps ammonium's subscript", () => {
    expect(normalizeMathDelimiters("溶液中 Ca2+ 与 NH4+")).toBe(
      "溶液中 $\\mathrm{Ca^{2+}}$ 与 $\\mathrm{NH_{4}^{+}}$",
    );
  });

  it("leaves citations, prose, and significance marks alone", () => {
    const src = "见[1,2] 与 COVID 的讨论，P<0.05";
    expect(normalizeMathDelimiters(src)).toBe(src);
  });

  it("wraps variable subscripts and unit exponents", () => {
    expect(normalizeMathDelimiters("Y_{biochar} 约为 12 kg·ha^{-1}")).toBe(
      "$Y_{biochar}$ 约为 12 kg·$\\mathrm{ha}^{-1}$",
    );
  });

  it("turns mhchem into mathrm", () => {
    expect(normalizeMathDelimiters("水为 \\ce{H2O}")).toBe(
      "水为 $\\mathrm{H_{2}O}$",
    );
  });
});
