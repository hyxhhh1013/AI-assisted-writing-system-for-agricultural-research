import { describe, expect, it } from "vitest";
import { groupXrdFigures, XRD_DEFAULT_FIGURE_ID } from "@/contracts/xrd-figures";
import {
  buildXpsQuantTableHtml,
  computeXpsQuantRows,
  bgParamsFromPreset,
} from "@/lib/xps-presets";
import {
  buildXrdPeakTableHtml,
  parseScherrerPeakText,
  peaksToScherrerText,
} from "@/lib/xrd-workflow-utils";
import type { FigureDef } from "@/services/figures";

function fig(id: string): FigureDef {
  return {
    id,
    name: id,
    category: "xrd",
    description: "",
    endpoint: "",
    input_type: "form",
  };
}

describe("groupXrdFigures", () => {
  it("splits common vs advanced and orders stack first", () => {
    const all = [
      fig("xrd_bragg"),
      fig("xrd_stack"),
      fig("xrd_xps"),
      fig("xrd_simulate"),
    ];
    const { common, advanced } = groupXrdFigures(all);
    expect(common.map((f) => f.id)).toEqual(["xrd_stack", "xrd_xps"]);
    expect(advanced.map((f) => f.id)).toEqual(["xrd_simulate", "xrd_bragg"]);
  });

  it("default figure id is workflow", () => {
    expect(XRD_DEFAULT_FIGURE_ID).toBe("xrd_workflow");
  });
});

describe("xrd-workflow-utils", () => {
  it("converts peaks to scherrer text", () => {
    const text = peaksToScherrerText([{ two_theta: 28.4, intensity: 100, relative_intensity: 80 }], 0.3);
    expect(text).toContain("28.40");
    expect(text).toContain("0.300");
  });

  it("uses measured fwhm when available", () => {
    const text = peaksToScherrerText([
      { two_theta: 28.4, intensity: 100, relative_intensity: 80, fwhm: 0.18 },
    ]);
    expect(text).toContain("0.180");
    expect(text).not.toContain("0.250");
  });

  it("parses scherrer peak text", () => {
    const peaks = parseScherrerPeakText("(111), 28.4, 0.25\n30, 0.2");
    expect(peaks).toHaveLength(2);
    expect(peaks[0].label).toBe("(111)");
  });

  it("builds peak table html", () => {
    const html = buildXrdPeakTableHtml("峰表", [
      { two_theta: 28.4, intensity: 1000, relative_intensity: 80 },
    ]);
    expect(html).toContain("28.400");
  });
});

describe("xps-presets", () => {
  it("normalizes quant rows to 100%", () => {
    const rows = computeXpsQuantRows([
      { mu: 284.8, fwhm: 1.2, weight: 60, sigma2: 1 },
      { mu: 286.5, fwhm: 1.1, weight: 40, sigma2: 1 },
    ]);
    expect(rows).toHaveLength(2);
    const sum = rows.reduce((s, r) => s + r.area, 0);
    expect(sum).toBeCloseTo(100, 5);
  });

  it("builds quant table html", () => {
    const html = buildXpsQuantTableHtml("XPS 表", [
      { index: 1, mu: 284.8, fwhm: 1.2, weight: 60, area: 60 },
    ]);
    expect(html).toContain("XPS 表");
    expect(html).toContain("284.80");
  });

  it("returns bg params for preset", () => {
    const p = bgParamsFromPreset("shirley");
    expect(p.LFctg).toBeDefined();
  });
});
