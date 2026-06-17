import { describe, expect, it } from "vitest";
import type { ChartConfig, DataSourceAnalysis } from "@/contracts/data-source";
import {
  buildChartReplayFigureSpec,
  buildPlotPageHref,
  chartAssetToPlotHref,
  chartConfigToPasteText,
  chartConfigToPrefill,
  chartTypeToFigureId,
  collectChartConfigsFromSources,
  decodeFigureSpecParam,
  detectedFigureToPlotHref,
  encodeFigureSpecParam,
  figureBlockJsonToPlotHref,
  figureChartConfigToPrefill,
  figureSpecToFlowPrefill,
  figureSpecToPrefill,
  figureToolToRegistryId,
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

  it("maps FIGURE chart config to plot prefill and href", () => {
    const block = {
      tool: "chart",
      config: {
        type: "bar",
        data: {
          labels: ["A", "B"],
          datasets: [{ label: "产量", data: [10, 20] }],
        },
      },
      caption: "图3 产量对比",
    };
    const prefill = figureChartConfigToPrefill(block.config, block.caption);
    expect(prefill?.figureId).toBe("bar_grouped");
    expect(prefill?.pasteText).toContain("A,10");
    expect(figureToolToRegistryId("chart", block.config)).toBe("bar_grouped");
    expect(figureToolToRegistryId("mechanism", {})).toBe("flow");

    const spec = { tool: "chart" as const, config: block.config, caption: block.caption };
    const encoded = encodeFigureSpecParam(spec);
    expect(decodeFigureSpecParam(encoded)?.caption).toBe("图3 产量对比");
    expect(figureSpecToPrefill(spec)?.title).toBe("图3 产量对比");

    const href = figureBlockJsonToPlotHref("proj-1", block);
    expect(href).toContain("/plot?");
    expect(href).toContain("id=proj-1");
    expect(href).toContain("figure=bar_grouped");
    expect(href).toContain("figureSpec=");

    const fromBuild = buildPlotPageHref({
      projectId: "p1",
      figureId: "line",
      chartIdx: 2,
    });
    expect(fromBuild).toBe("/plot?id=p1&figure=line&chartIdx=2");
  });

  it("stores and replays chart asset figureSpecEnc via chartAssetId href", () => {
    const spec = buildChartReplayFigureSpec({
      caption: "图1 产量",
      chartType: "bar",
      title: "产量",
      xLabel: "处理",
      yLabel: "kg",
      parsedData: {
        labels: ["A", "B"],
        datasets: [{ label: "产量", data: [1, 2] }],
      },
    });
    expect(spec).not.toBeNull();
    const enc = encodeFigureSpecParam(spec!);
    const raw = JSON.stringify([
      {
        id: "asset-1",
        figureId: "bar_grouped",
        caption: "图1 产量",
        imageUrl: "/x.png",
        figureSpecEnc: enc,
        createdAt: 100,
      },
    ]);
    const assets = parseProjectCharts(raw);
    expect(assets[0].figureSpecEnc).toBe(enc);

    const href = chartAssetToPlotHref("proj-1", assets[0]);
    expect(href).toContain("chartAssetId=asset-1");
    expect(href).toContain("figure=bar_grouped");
    expect(href).not.toContain("figureSpec=");

    const replay = figureSpecToPrefill(decodeFigureSpecParam(enc)!);
    expect(replay?.pasteText).toContain("A,1");
    expect(replay?.figureId).toBe("bar_grouped");
  });

  it("builds flow prefill and detected figure plot href", () => {
    const flowSpec = {
      tool: "flow" as const,
      config: {
        title: "流程",
        direction: "horizontal",
        nodes: [{ id: "1", label: "A" }, { id: "2", label: "B" }],
        edges: [{ from: "1", to: "2" }],
      },
      caption: "图2 流程",
    };
    const flowPrefill = figureSpecToFlowPrefill(flowSpec);
    expect(flowPrefill?.direction).toBe("horizontal");
    expect(flowPrefill?.nodes).toHaveLength(2);

    const href = detectedFigureToPlotHref("p1", {
      tool: "chart",
      config: JSON.stringify({
        type: "bar",
        data: { labels: ["A"], datasets: [{ label: "y", data: [1] }] },
      }),
      caption: "图2",
    });
    expect(href).toContain("/plot?");
  });
});
