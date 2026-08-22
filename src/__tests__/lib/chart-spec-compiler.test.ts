import { describe, expect, it } from "vitest";
import {
  attachCompiledSpec,
  chartSpecToPlotConfig,
  compileChartSpec,
  compileChartSpecFromLooseConfig,
} from "@/lib/chart-spec-compiler";

describe("compileChartSpec", () => {
  it("repairs y-axis unit from column name", () => {
    const { spec, findings } = compileChartSpec({
      chartType: "bar_grouped",
      csv: "处理,产量 (kg/ha)\nCK,12\nA,15",
      yLabel: "产量",
      title: "产量",
    });
    expect(spec.encoding.yLabel).toBe("产量 (kg/ha)");
    expect(spec.data.columns?.y).toContain("产量 (kg/ha)");
    expect(findings.some((f) => f.code === "missing_unit" && f.action === "repair")).toBe(true);
    expect(findings.some((f) => f.action === "block")).toBe(false);
  });

  it("blocks when y label has no unit", () => {
    const { findings } = compileChartSpec({
      chartType: "bar_grouped",
      csv: "处理,产量\nCK,12\nA,15",
      yLabel: "产量",
    });
    expect(findings.some((f) => f.code === "missing_unit" && f.action === "block")).toBe(true);
  });

  it("pairs error columns and flags unpaired", () => {
    const ok = compileChartSpec({
      chartType: "bar_grouped",
      csv: "处理,产量,产量_sd\nCK,12,1\nA,15,0.8",
      yLabel: "产量 (kg/ha)",
    });
    expect(ok.spec.data.columns?.errors?.产量).toBe("sd");
    expect(ok.findings.some((f) => f.code === "error_col_unpaired")).toBe(false);

    const bad = compileChartSpec({
      chartType: "bar_grouped",
      csv: "处理,产量_sd\nCK,1\nA,2",
      yLabel: "产量 (kg/ha)",
    });
    expect(bad.findings.some((f) => f.code === "error_col_unpaired")).toBe(true);
  });

  it("flags significance out of range", () => {
    const { findings } = compileChartSpec({
      chartType: "bar_grouped",
      csv: "处理,产量 (t/ha)\nCK,1\nA,2",
      significance: [{ category: 5, value: "**" }],
    });
    expect(findings.some((f) => f.code === "significance_oob")).toBe(true);
  });

  it("marks pie as unitless", () => {
    const { findings } = compileChartSpec({
      chartType: "pie",
      csv: "组分,占比\nA,40\nB,60",
    });
    expect(findings.some((f) => f.code === "missing_unit" && f.action === "block")).toBe(false);
  });

  it("lifts loose /plot config and attaches chartSpec", () => {
    const { spec } = compileChartSpecFromLooseConfig(
      {
        chart_type: "line",
        title: "趋势",
        x_label: "时间 (d)",
        y_label: "含量 (mg/g)",
        style: { preset: "agr_journal", columns: 2 },
      },
      "时间,含量\n1,3\n2,4",
    );
    expect(spec.chartType).toBe("line");
    expect(spec.journal.preset).toBe("agr_journal");
    expect(spec.journal.columns).toBe(2);

    const attached = attachCompiledSpec(
      { chart_type: "bar", title: "对比", dual_y: true },
      "处理,产量 (kg/ha)\nCK,1\nA,2",
    );
    expect(attached.config.dual_y).toBe(true);
    expect(attached.config.chartSpec).toBeDefined();
    const plot = chartSpecToPlotConfig(attached.config.chartSpec as never);
    expect(plot.chart_type).toBe("bar_grouped");
  });
});
