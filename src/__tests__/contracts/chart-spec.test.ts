import { describe, expect, it } from "vitest";
import {
  archetypeFromTool,
  chartSpecToFigureSpec,
  decodeChartSpecEnc,
  encodeChartSpecEnc,
  encodingNeedsUnit,
  figureSpecToChartSpec,
  hasAxisUnit,
  parseChartSpec,
  type ChartSpecV1,
} from "@/contracts/chart-spec";
import {
  buildChartReplayFigureSpec,
  decodeFigureSpecParam,
  encodeFigureSpecParam,
  figureSpecToPrefill,
} from "@/contracts/figure";

function sampleSpec(over: Partial<ChartSpecV1> = {}): ChartSpecV1 {
  return {
    version: 1,
    archetype: "quantitative",
    chartType: "bar_grouped",
    claim: "处理提高产量",
    data: {
      sourceKind: "inline",
      labels: ["CK", "A"],
      datasets: [{ label: "产量", data: [12, 15] }],
      columns: { x: "处理", y: ["产量"] },
    },
    encoding: { xLabel: "处理", yLabel: "产量 (kg/ha)", title: "产量" },
    journal: { preset: "nature", columns: 1, exportFormats: ["png", "svg", "pdf"] },
    layout: { legend: "auto" },
    caption: "图1 产量对比",
    ...over,
  };
}

describe("ChartSpecV1", () => {
  it("parses a valid spec and rejects bad version/archetype", () => {
    expect(parseChartSpec(sampleSpec())?.chartType).toBe("bar_grouped");
    expect(parseChartSpec({ ...sampleSpec(), version: 2 })).toBeNull();
    expect(parseChartSpec({ ...sampleSpec(), archetype: "poster" })).toBeNull();
    expect(parseChartSpec({ ...sampleSpec(), journal: { preset: "nature", columns: 3 } })).toBeNull();
  });

  it("detects axis units for L0", () => {
    expect(hasAxisUnit("产量 (kg/ha)")).toBe(true);
    expect(hasAxisUnit("产量（kg/ha）")).toBe(true);
    expect(hasAxisUnit("产量")).toBe(false);
    expect(encodingNeedsUnit({ xLabel: "处理", yLabel: "产量" })).toBe(true);
    expect(encodingNeedsUnit({ xLabel: "处理", yLabel: "产量 (kg/ha)" })).toBe(false);
    expect(encodingNeedsUnit({ xLabel: "处理", yLabel: "产量", unitless: true })).toBe(false);
  });

  it("maps tools to archetypes", () => {
    expect(archetypeFromTool("chart", "bar_grouped")).toBe("quantitative");
    expect(archetypeFromTool("flow")).toBe("schematic");
    expect(archetypeFromTool("xrd_peakfit")).toBe("instrument");
    expect(archetypeFromTool("dft_band")).toBe("dft");
  });

  it("lifts FigureSpec replay and round-trips without breaking prefill", () => {
    const figure = buildChartReplayFigureSpec({
      caption: "图1 产量",
      chartType: "bar",
      title: "产量",
      xLabel: "处理",
      yLabel: "产量 (kg/ha)",
      style: { preset: "agr_journal", columns: 2, show_values: true },
      parsedData: {
        labels: ["A", "B"],
        datasets: [{ label: "产量", data: [1, 2] }],
      },
    });
    expect(figure).not.toBeNull();
    const lifted = figureSpecToChartSpec(figure!);
    expect(lifted?.chartType).toBe("bar_grouped");
    expect(lifted?.archetype).toBe("quantitative");
    expect(lifted?.journal.preset).toBe("agr_journal");
    expect(lifted?.journal.columns).toBe(2);
    expect(lifted?.data.labels).toEqual(["A", "B"]);
    expect(lifted?.encoding.yLabel).toBe("产量 (kg/ha)");
    expect(lifted?.layout?.showValues).toBe(true);

    const back = chartSpecToFigureSpec(lifted!);
    const prefill = figureSpecToPrefill(back);
    expect(prefill?.figureId).toBe("bar_grouped");
    expect(prefill?.pasteText).toContain("A,1");
    expect(prefill?.yLabel).toBe("产量 (kg/ha)");
  });

  it("decodes existing figureSpecEnc via adapter", () => {
    const figure = buildChartReplayFigureSpec({
      caption: "图3",
      chartType: "line",
      title: "趋势",
      xLabel: "时间 (d)",
      yLabel: "含量 (mg/g)",
      parsedData: {
        labels: ["1", "2"],
        datasets: [{ label: "N", data: [3, 4] }],
      },
    });
    const enc = encodeFigureSpecParam(figure!);
    expect(decodeFigureSpecParam(enc)?.caption).toBe("图3");
    const spec = decodeChartSpecEnc(enc);
    expect(spec?.chartType).toBe("line");
    expect(spec?.encoding.xLabel).toBe("时间 (d)");
  });

  it("encodes ChartSpecV1 and decodes it back", () => {
    const spec = sampleSpec({
      annotations: { significance: [{ category: 0, value: "**" }] },
    });
    const enc = encodeChartSpecEnc(spec);
    const back = decodeChartSpecEnc(enc);
    expect(back?.claim).toBe("处理提高产量");
    expect(back?.annotations?.significance?.[0]).toEqual({ category: 0, value: "**" });
  });

  it("lifts forest FigureSpec", () => {
    const figure = buildChartReplayFigureSpec({
      caption: "图2 森林图",
      chartType: "forest",
      title: "效应量",
      xLabel: "效应量",
      yLabel: "",
      parsedData: {
        labels: ["S1", "S2"],
        datasets: [],
        forest: { estimates: [0.5, 0.8], ci_low: [0.2, 0.4], ci_high: [0.8, 1.2] },
      },
    });
    const lifted = figureSpecToChartSpec(figure!);
    expect(lifted?.chartType).toBe("forest");
    expect(lifted?.data.labels).toEqual(["S1", "S2"]);
  });

  it("lifts schematic / instrument tools", () => {
    const flow = figureSpecToChartSpec({
      tool: "flow",
      caption: "路径",
      config: { title: "热解", direction: "vertical" },
    });
    expect(flow?.archetype).toBe("schematic");
    expect(flow?.chartType).toBe("flow");

    const xrd = figureSpecToChartSpec({
      tool: "xrd_peakfit",
      caption: "峰拟合",
      config: { title: "XRD" },
    });
    expect(xrd?.archetype).toBe("instrument");
    expect(xrd?.chartType).toBe("xrd_peakfit");
  });
});
