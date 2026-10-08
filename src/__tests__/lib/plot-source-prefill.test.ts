import { describe, expect, it } from "vitest";
import type { DataSourceAnalysis } from "@/contracts/data-source";
import { prefillFromSource, tableSeedsFromSource } from "@/lib/plot-source-prefill";

function source(partial: Partial<DataSourceAnalysis>): DataSourceAnalysis {
  return {
    fileName: "a.csv",
    rowCount: 2,
    columns: [],
    stats: [],
    generatedAt: 1,
    ...partial,
  };
}

describe("prefillFromSource", () => {
  it("downsamples a long spectrum and opens the line chart", () => {
    const labels = Array.from({ length: 800 }, (_, i) => String(i));
    const built = prefillFromSource(source({
      fileName: "Fe2p.xlsx · Binding Energy",
      rowCount: 800,
      columns: [
        { name: "eV", type: "numeric", count: 800 },
        { name: "counts", type: "numeric", count: 800 },
      ],
      chartConfigs: [{
        type: "line",
        title: "Fe2p",
        xLabel: "eV",
        yLabel: "counts",
        labels,
        datasets: [{ label: "counts", data: labels.map((_, i) => i) }],
      }],
    }));
    expect(built?.prefill.figureId).toBe("line");
    expect(built?.prefill.xLabel).toBe("eV");
    const rows = built?.prefill.pasteText.split("\n") ?? [];
    expect(rows.length).toBeLessThan(400);
    expect(rows[rows.length - 1]?.startsWith("799")).toBe(true);
    expect(built?.note).toMatch(/抽成/);
  });

  it("uses the stored preview when there is no chart config", () => {
    const built = prefillFromSource(source({
      rowCount: 4,
      columns: [
        { name: "样品", type: "group", count: 4 },
        { name: "产量", type: "numeric", count: 4 },
      ],
      previewHeaders: ["样品", "产量"],
      preview: [["A", "1.2"], ["B", "3.4"]],
    }));
    expect(built?.prefill.figureId).toBe("bar_grouped");
    expect(built?.prefill.pasteText).toContain("A,1.2");
  });
});

describe("tableSeedsFromSource", () => {
  it("reads group means and skips spectra without groups", () => {
    expect(tableSeedsFromSource(source({ stats: [] }))).toBeNull();
    const seeds = tableSeedsFromSource(source({
      stats: [{
        variable: "产量",
        mean: 2,
        sd: 0.2,
        min: 1,
        max: 3,
        groups: [
          { label: "对照", mean: 1.1, sd: 0.2, n: 3 },
          { label: "处理", mean: 2.4, sd: 0.3, n: 3 },
        ],
      }],
    }));
    expect(seeds?.map((seed) => seed.label)).toEqual(["对照", "处理"]);
    expect(seeds?.[0]?.variable).toBe("产量");
  });
});
