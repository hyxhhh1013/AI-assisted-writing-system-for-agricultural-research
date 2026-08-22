import { describe, expect, it } from "vitest";
import type { ChartSpecV1 } from "@/contracts/chart-spec";
import { applyChartSpecPatches } from "@/lib/chart-spec-patches";

function spec(over: Partial<ChartSpecV1> = {}): ChartSpecV1 {
  return {
    version: 1,
    archetype: "quantitative",
    chartType: "bar_grouped",
    claim: "产量",
    data: {
      sourceKind: "csv",
      columns: { x: "处理", y: ["产量 (kg/ha)"] },
      labels: ["CK", "A"],
      datasets: [{ label: "产量 (kg/ha)", data: [12, 15] }],
    },
    encoding: { xLabel: "处理", yLabel: "产量" },
    journal: { preset: "nature", columns: 1, exportFormats: ["png"] },
    layout: { legend: "auto" },
    caption: "图1",
    ...over,
  };
}

describe("applyChartSpecPatches", () => {
  it("rotates ticks on label_overlap and is idempotent at 35°", () => {
    const first = applyChartSpecPatches(spec(), [
      { code: "label_overlap", layer: "L2", action: "repair", message: "重叠" },
    ]);
    expect(first.spec.layout?.xTickRotation).toBe(35);
    expect(first.patches).toEqual([
      { code: "label_overlap", path: "layout.xTickRotation", before: 0, after: 35 },
    ]);
    const second = applyChartSpecPatches(first.spec, [
      { code: "label_overlap", layer: "L2", action: "repair", message: "重叠" },
    ]);
    expect(second.patches).toEqual([]);
  });

  it("walks legend auto → outer-right → outer-bottom", () => {
    const a = applyChartSpecPatches(spec(), [
      { code: "legend_covers_data", layer: "L2", action: "repair", message: "挡" },
    ]);
    expect(a.spec.layout?.legend).toBe("outer-right");
    const b = applyChartSpecPatches(a.spec, [
      { code: "legend_covers_data", layer: "L2", action: "repair", message: "挡" },
    ]);
    expect(b.spec.layout?.legend).toBe("outer-bottom");
    const c = applyChartSpecPatches(b.spec, [
      { code: "legend_covers_data", layer: "L2", action: "repair", message: "挡" },
    ]);
    expect(c.patches).toEqual([]);
  });

  it("fills y-axis unit from column names", () => {
    const { spec: next, patches } = applyChartSpecPatches(spec(), [
      { code: "missing_unit", layer: "L0", action: "block", message: "缺单位" },
    ]);
    expect(next.encoding.yLabel).toBe("产量 (kg/ha)");
    expect(patches[0]?.path).toBe("encoding.yLabel");
  });

  it("ignores pass findings", () => {
    const { patches } = applyChartSpecPatches(spec(), [
      { code: "dpi", layer: "L1", action: "pass", message: "DPI=300" },
    ]);
    expect(patches).toEqual([]);
  });
});
