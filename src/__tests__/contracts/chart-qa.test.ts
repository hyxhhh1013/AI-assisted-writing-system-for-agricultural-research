import { describe, expect, it } from "vitest";
import {
  chartQaVerdictLabel,
  liftStyleValidation,
  parseChartQaReport,
  summarizeChartQa,
  verdictFromFindings,
} from "@/contracts/chart-qa";

describe("ChartQaReport", () => {
  it("lifts styleValidation fail/warn into verdict", () => {
    const report = liftStyleValidation({
      ok: false,
      preset: "nature",
      columns: 1,
      target_width_in: 3.5,
      checks: [
        { level: "fail", code: "font_too_small", message: "字号 4 pt 过小" },
        { level: "warn", code: "width_off_spec", message: "图宽偏离刊规" },
        { level: "pass", code: "dpi", message: "DPI=600" },
      ],
    });
    expect(report.verdict).toBe("block");
    expect(report.findings.find((f) => f.code === "font_too_small")?.action).toBe("block");
    expect(report.findings.find((f) => f.code === "width_off_spec")?.action).toBe("repair");
    expect(report.targetWidthIn).toBe(3.5);
  });

  it("maps overlap codes to repair", () => {
    const report = liftStyleValidation({
      ok: true,
      checks: [{ level: "fail", code: "label_overlap", message: "刻度重叠" }],
    });
    expect(report.verdict).toBe("repair");
    expect(summarizeChartQa(report).repairCodes).toEqual(["label_overlap"]);
  });

  it("parses a structured report and summarizes", () => {
    const parsed = parseChartQaReport({
      verdict: "repair",
      findings: [
        { code: "missing_unit", layer: "L0", action: "repair", message: "补 y 轴单位" },
        { code: "dpi", layer: "L1", action: "pass", message: "DPI=600" },
      ],
      target_width_in: 3.5,
    });
    expect(parsed?.verdict).toBe("repair");
    expect(parsed?.targetWidthIn).toBe(3.5);
    expect(verdictFromFindings(parsed!.findings)).toBe("repair");
    expect(chartQaVerdictLabel("block")).toBe("不可入库");
  });

  it("treats ok=false with empty checks as block", () => {
    const report = liftStyleValidation({ ok: false, checks: [] });
    expect(report.verdict).toBe("block");
  });
});
