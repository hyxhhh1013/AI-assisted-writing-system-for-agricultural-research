import { describe, expect, it } from "vitest";
import type { DataSourceAnalysis } from "@/contracts/data-source";
import {
  noPlotDataGuidance,
  resolvePlotCandidate,
  type AgentPlotSourcesBundle,
} from "@/lib/agent/plot-sources";

function sampleBundle(): AgentPlotSourcesBundle {
  const sources: DataSourceAnalysis[] = [
    {
      fileName: "trial.csv",
      rowCount: 2,
      columns: [],
      stats: [],
      generatedAt: 1,
      chartConfigs: [
        {
          type: "bar",
          title: "各处理产量",
          xLabel: "处理",
          yLabel: "产量",
          labels: ["A", "B"],
          datasets: [{ label: "产量", data: [1.2, 3.4] }],
        },
      ],
    },
  ];
  return {
    sources,
    claims: [],
    candidates: [
      {
        index: 0,
        title: "各处理产量",
        chartType: "bar",
        figureId: "bar_grouped",
        sourceFileName: "trial.csv",
        previewCsv: "处理,产量\nA,1.2\nB,3.4",
      },
    ],
    existingChartCount: 0,
  };
}

describe("agent plot-sources", () => {
  it("resolves chartIndex to csv + figure id", () => {
    const resolved = resolvePlotCandidate(sampleBundle(), 0);
    expect("error" in resolved).toBe(false);
    if ("error" in resolved) return;
    expect(resolved.figureId).toBe("bar_grouped");
    expect(resolved.csv).toContain("处理,产量");
    expect(resolved.csv).toContain("A,1.2");
  });

  it("rejects out-of-range chartIndex", () => {
    const resolved = resolvePlotCandidate(sampleBundle(), 9);
    expect("error" in resolved).toBe(true);
  });

  it("guidance mentions upload when empty", () => {
    const text = noPlotDataGuidance(2, 1);
    expect(text).toMatch(/上传/);
    expect(text).toMatch(/CSV/);
    expect(text).toMatch(/2 条证据/);
  });
});
