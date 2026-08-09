import { describe, expect, it } from "vitest";
import type { ChartConfig, DataSourceAnalysis } from "@/contracts/data-source";
import {
  buildAgentPlotRefineHref,
  buildChartReplayFigureSpec,
  buildPlotInsertReplay,
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
  figureSpecToPlotToolPrefill,
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
    expect(figureToolToRegistryId("mechanism", {})).toBe("mechanism");

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

  it("builds forest replay spec and prefill round-trip", () => {
    const spec = buildChartReplayFigureSpec({
      caption: "图2 森林图",
      chartType: "forest",
      title: "效应量",
      xLabel: "效应量",
      yLabel: "",
      parsedData: {
        labels: ["Study A", "Study B"],
        datasets: [],
        forest: {
          estimates: [0.5, 0.8],
          ci_low: [0.2, 0.4],
          ci_high: [0.8, 1.2],
        },
      },
    });
    expect(spec).not.toBeNull();
    expect(spec?.config.forest).toBeDefined();

    const prefill = figureSpecToPrefill(spec!);
    expect(prefill?.figureId).toBe("forest");
    expect(prefill?.pasteText).toContain("Study A,0.5");
  });

  it("builds molecule and xrd plot href with figureSpec", () => {
    const molBlock = {
      tool: "molecule",
      config: { mode: "mol", smiles: "CC(=O)O", label: "Acetic" },
      caption: "图4 分子结构",
    };
    const href = figureBlockJsonToPlotHref("proj-1", molBlock);
    expect(href).toContain("figure=molecule");
    expect(href).toContain("figureSpec=");
    const enc = new URL(href!, "http://local").searchParams.get("figureSpec");
    expect(enc).toBeTruthy();
    const spec = decodeFigureSpecParam(enc!);
    expect(spec?.tool).toBe("molecule");
    const toolPrefill = figureSpecToPlotToolPrefill(spec!);
    expect(toolPrefill?.figureId).toBe("molecule");
    expect(toolPrefill?.config.smiles).toBe("CC(=O)O");

    const braggConfig = {
      crystal_system: "1",
      a: "4.0",
      hkl_input: "1 1 1\n2 0 0",
      angle_input: "38.2\n44.4",
      wavelength: "1.54056",
      title: "Bragg test",
    };
    const replay = buildPlotInsertReplay("xrd_bragg", "图5 Bragg", braggConfig);
    expect(replay.figureSpecEnc).toBeTruthy();
    const decoded = decodeFigureSpecParam(replay.figureSpecEnc!);
    expect(decoded?.tool).toBe("xrd_bragg");
    expect(figureSpecToPlotToolPrefill(decoded!)?.config.title).toBe("Bragg test");
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

  it("maps mermaid mechanism to PlotToolPrefill (not empty FlowPrefill)", () => {
    const spec = {
      tool: "mechanism" as const,
      config: { mermaid: "graph TD\n  A-->B", title: "机理" },
      caption: "图3 机理",
    };
    expect(figureSpecToFlowPrefill(spec)).toBeNull();
    const tool = figureSpecToPlotToolPrefill(spec);
    expect(tool?.figureId).toBe("mechanism");
    expect(tool?.config.mermaid).toContain("graph TD");
  });

  it("buildAgentPlotRefineHref prefers chartAssetId over long figureSpec", () => {
    const href = buildAgentPlotRefineHref({
      projectId: "p1",
      figureId: "flow",
      figureSpecEnc: "enc-long",
      chartAssetId: "asset-9",
      imageUrl: "/api/charts/x.png",
    });
    expect(href).toContain("chartAssetId=asset-9");
    expect(href).not.toContain("figureSpec=");
    expect(href).toContain("replaceImageUrl=");
  });
});
