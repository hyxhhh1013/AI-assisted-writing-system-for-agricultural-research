import { describe, expect, it } from "vitest";
import type { ChartConfig, DataSourceAnalysis } from "@/contracts/data-source";
import {
  chartConfigToPasteText,
  chartConfigToPrefill,
  chartTypeToFigureId,
  collectChartConfigsFromSources,
  parseProjectCharts,
} from "@/contracts/figure";

describe("chart prefill contracts", () => {
  it("maps chart types to registry figure ids", () => {
    expect(chartTypeToFigureId("line")).toBe("line");
    expect(chartTypeToFigureId("bar")).toBe("bar_grouped");
  });

  it("serializes chart config to CSV paste text", () => {
    const cfg: ChartConfig = {
      type: "bar",
      title: "对比",
      xLabel: "处理",
      yLabel: "产量",
      labels: ["A", "B"],
      datasets: [{ label: "产量", data: [1.2, 3.4] }],
    };
    expect(chartConfigToPasteText(cfg)).toBe("处理,产量\nA,1.2\nB,3.4");
    expect(chartConfigToPrefill(cfg).figureId).toBe("bar_grouped");
  });

  it("collects stored chartConfigs from dataSources", () => {
    const sources: DataSourceAnalysis[] = [
      {
        fileName: "a.csv",
        rowCount: 2,
        columns: [],
        stats: [],
        generatedAt: 1,
        chartConfigs: [
          {
            type: "line",
            title: "趋势",
            xLabel: "t",
            yLabel: "y",
            labels: ["1"],
            datasets: [{ label: "y", data: [1] }],
          },
        ],
      },
    ];
    expect(collectChartConfigsFromSources(sources)).toHaveLength(1);
  });

  it("falls back to groups in stats when chartConfigs missing", () => {
    const sources: DataSourceAnalysis[] = [
      {
        fileName: "a.csv",
        rowCount: 2,
        columns: [],
        stats: [
          {
            variable: "N",
            mean: 1,
            sd: 0,
            min: 0,
            max: 2,
            groups: [
              { label: "A", mean: 1, sd: 0, n: 3 },
              { label: "B", mean: 2, sd: 0, n: 3 },
            ],
          },
        ],
        generatedAt: 1,
      },
    ];
    const configs = collectChartConfigsFromSources(sources);
    expect(configs).toHaveLength(1);
    expect(configs[0].labels).toEqual(["A", "B"]);
  });

  it("parses project charts JSON safely", () => {
    expect(parseProjectCharts("[]")).toEqual([]);
    expect(parseProjectCharts("not-json")).toEqual([]);
    const raw = JSON.stringify([
      {
        id: "1",
        figureId: "line",
        caption: "c",
        imageUrl: "/x.png",
        createdAt: 100,
      },
    ]);
    expect(parseProjectCharts(raw)).toHaveLength(1);
  });
});
