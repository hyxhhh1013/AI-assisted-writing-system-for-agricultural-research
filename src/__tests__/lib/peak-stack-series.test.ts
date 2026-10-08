import { describe, expect, it } from "vitest";
import type { DataSourceAnalysis } from "@/contracts/data-source";
import {
  alignPeakStack,
  axisForKind,
  collectPeakStackSeries,
  parseGuideMarks,
  parsePeakMarks,
} from "@/lib/agent/peak-stack-series";

function curve(fileName: string, column: string, x0: number, slope: number): DataSourceAnalysis {
  const labels = Array.from({ length: 40 }, (_, i) => String(x0 + i));
  const data = labels.map((_, i) => slope * i);
  return {
    fileName,
    rowCount: labels.length,
    columns: [],
    stats: [],
    generatedAt: 0,
    chartConfigs: [{
      type: "line",
      title: fileName,
      labels,
      datasets: [{ label: column, data }],
    }],
  };
}

describe("peak stack series", () => {
  it("matches a stored block name and keeps the column name", () => {
    const sources = [
      curve("红外整合.xlsx · 谱", "Cu@ZSM-5", 500, 1),
      curve("Mn@生物炭.0.dpt", "y", 500, 2),
    ];
    const collected = collectPeakStackSeries(sources, ["红外整合.xlsx", "Mn@生物炭.0.dpt"]);
    expect(collected.missing).toEqual([]);
    expect(collected.series.map((item) => item.name)).toEqual(["Cu@ZSM-5", "Mn@生物炭.0"]);
  });

  it("fails the name that is not ingested", () => {
    const collected = collectPeakStackSeries(
      [curve("Cu@ZSM-5.0.dpt", "y", 400, 1)],
      ["Cu@ZSM-5.0.dpt", "不存在.dpt"],
    );
    expect(collected.missing).toEqual(["不存在.dpt"]);
  });

  it("does not invent peak labels when none are given", () => {
    expect(parsePeakMarks("")).toEqual({ peaks: [] });
    expect(parseGuideMarks("")).toEqual({ guides: [] });
    const named = parsePeakMarks('[{"x":26.5,"label":"Mo","marker":"diamond"}]');
    expect(named).toEqual({
      peaks: [{ x: 26.5, label: "Mo", marker: "diamond" }],
    });
    expect(parsePeakMarks('[{"label":"Fe2+"}]')).toEqual({
      error: "每个峰标记都要有数字 x，不要写无法定位的名称",
    });
  });

  it("reverses the IR axis and keeps XRD ascending", () => {
    expect(axisForKind("ir", {}).xReverse).toBe(true);
    expect(axisForKind("ir", {}).xLabel).toMatch(/Wavenumber/);
    expect(axisForKind("xrd", {}).xReverse).toBe(false);
    expect(axisForKind("xrd", { xLabel: "2θ (°)" }).xLabel).toBe("2θ (°)");
    expect(axisForKind("xps", {}).xReverse).toBe(true);
    expect(axisForKind("raman", {}).xReverse).toBe(false);
  });

  it("aligns overlapping curves and refuses a range with no overlap", () => {
    const aligned = alignPeakStack([
      { name: "A", x: [10, 20, 30], y: [1, 2, 3] },
      { name: "B", x: [20, 30, 40], y: [4, 5, 6] },
    ]);
    expect("csv" in aligned).toBe(true);
    if ("csv" in aligned) {
      expect(aligned.xMin).toBe(20);
      expect(aligned.xMax).toBe(30);
      expect(aligned.csv.split("\n")[0]).toBe("x,A,B");
    }
    const missed = alignPeakStack([
      { name: "A", x: [10, 20], y: [1, 2] },
      { name: "B", x: [30, 40], y: [3, 4] },
    ]);
    expect(missed).toEqual({ error: "这些谱的横轴范围对不上，没有可以叠在一起的区间" });
  });
});
