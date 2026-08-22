/**
 * FIG-QA-002：松散出图意图 → ChartSpecV1。
 * 不渲染；只补单位/误差列/刊规，并产出 L0 findings。
 */
import type { ChartQaFinding } from "@/contracts/chart-qa";
import { verdictFromFindings } from "@/contracts/chart-qa";
import type {
  ChartErrorKind,
  ChartSpecColumns,
  ChartSpecLayout,
  ChartSpecSeries,
  ChartSpecV1,
  SignificanceMark,
} from "@/contracts/chart-spec";
import {
  archetypeFromTool,
  chartSpecToFigureSpec,
  encodingNeedsUnit,
  hasAxisUnit,
  parseChartSpec,
} from "@/contracts/chart-spec";
import type { ChartExportFormat, ChartStylePreset } from "@/contracts/chart-style";
import { figureToolToRegistryId } from "@/contracts/figure";
import { parseChartTabular } from "@/lib/chart-tabular-parse";

const ERROR_SUFFIX_KIND: Array<{ suffix: string; kind: ChartErrorKind }> = [
  { suffix: "_sem", kind: "se" },
  { suffix: "_std", kind: "sd" },
  { suffix: "_err", kind: "sd" },
  { suffix: "_sd", kind: "sd" },
  { suffix: "_se", kind: "se" },
  { suffix: "_ci", kind: "ci" },
];

const UNITLESS_TYPES = new Set(["pie", "radar", "heatmap"]);
const COL_UNIT_RE = /^(.+?)\s*[（(]([^）)]+)[）)]\s*$/;

export interface CompileChartSpecInput {
  chartType: string;
  csv?: string;
  chartIndex?: number;
  title?: string;
  caption?: string;
  claim?: string;
  xLabel?: string;
  yLabel?: string;
  unitless?: boolean;
  preset?: string;
  columns?: 1 | 2;
  exportFormats?: ChartExportFormat[];
  significance?: unknown;
  extras?: Record<string, unknown>;
  labels?: string[];
  datasets?: ChartSpecSeries[];
}

export interface CompileChartSpecResult {
  spec: ChartSpecV1;
  findings: ChartQaFinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function detectSep(firstLine: string): string {
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";")) return ";";
  if (firstLine.includes("，")) return "，";
  return ",";
}

function parseSignificance(raw: unknown): SignificanceMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SignificanceMark[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.value !== "string" || !item.value.trim()) continue;
    const label = typeof item.label === "string" ? item.label : undefined;
    if (typeof item.fromCategory === "number" && typeof item.toCategory === "number") {
      out.push({
        fromCategory: item.fromCategory,
        toCategory: item.toCategory,
        value: item.value.trim(),
        label,
      });
      continue;
    }
    if (typeof item.category === "number") {
      const mark: SignificanceMark = { category: item.category, value: item.value.trim(), label };
      if (typeof item.series === "number") mark.series = item.series;
      out.push(mark);
    }
  }
  return out.length > 0 ? out : undefined;
}

function unitFromName(name: string): { base: string; unit: string } | null {
  const m = name.trim().match(COL_UNIT_RE);
  if (!m) return null;
  return { base: m[1].trim(), unit: m[2].trim() };
}

function errorKindFromHeader(header: string): { base: string; kind: ChartErrorKind } | null {
  const lower = header.toLowerCase();
  for (const { suffix, kind } of ERROR_SUFFIX_KIND) {
    if (lower.endsWith(suffix)) {
      return { base: header.slice(0, -suffix.length), kind };
    }
  }
  return null;
}

function parseCsvColumns(csv: string): {
  headers: string[];
  errors: Record<string, ChartErrorKind>;
  unpaired: string[];
} {
  const lines = csv.split("\n").filter((l) => l.trim());
  if (lines.length === 0) return { headers: [], errors: {}, unpaired: [] };
  const sep = detectSep(lines[0]);
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const errors: Record<string, ChartErrorKind> = {};
  const unpaired: string[] = [];
  for (const h of headers.slice(1)) {
    const parsed = errorKindFromHeader(h);
    if (!parsed) continue;
    if (headers.includes(parsed.base)) {
      errors[parsed.base] = parsed.kind;
    } else {
      unpaired.push(h);
    }
  }
  return { headers, errors, unpaired };
}

function isPreset(value: string): value is ChartStylePreset {
  return (
    value === "nature"
    || value === "agr_journal"
    || value === "agr_cn"
    || value === "ieee"
    || value === "acs"
    || value === "elsevier"
    || value === "print_bw"
    || value === "slide"
  );
}

function extrasStyle(extras: Record<string, unknown> | undefined): Record<string, unknown> {
  return extras && isRecord(extras.style) ? extras.style : {};
}

/** 主编译入口 */
export function compileChartSpec(input: CompileChartSpecInput): CompileChartSpecResult {
  const findings: ChartQaFinding[] = [];
  const extras = input.extras ?? {};
  const style = extrasStyle(extras);
  const chartType = figureToolToRegistryId("chart", {
    chart_type: input.chartType,
    type: input.chartType,
  });

  const parsed = input.csv ? parseChartTabular(input.csv, chartType) : null;
  const labels = input.labels ?? parsed?.labels;
  const datasets: ChartSpecSeries[] | undefined = input.datasets
    ?? parsed?.datasets?.map((d) => ({ label: d.label, data: d.data }));

  const csvCols = input.csv ? parseCsvColumns(input.csv) : { headers: [], errors: {}, unpaired: [] };
  for (const name of csvCols.unpaired) {
    findings.push({
      code: "error_col_unpaired",
      layer: "L0",
      action: "block",
      message: `误差列 ${name} 没有对应的数据列`,
    });
  }

  let xLabel = (input.xLabel ?? "").trim();
  let yLabel = (input.yLabel ?? "").trim();
  const yCols = datasets?.map((d) => d.label) ?? csvCols.headers.slice(1).filter((h) => !errorKindFromHeader(h));

  if (!xLabel && csvCols.headers[0]) xLabel = csvCols.headers[0];
  if (!yLabel && yCols.length === 1) yLabel = yCols[0] ?? "";

  if (!hasAxisUnit(yLabel)) {
    const fromCol = yCols.map(unitFromName).find((u) => u);
    if (fromCol) {
      yLabel = `${fromCol.base} (${fromCol.unit})`;
      findings.push({
        code: "missing_unit",
        layer: "L0",
        action: "repair",
        message: `已从列名回填 y 轴单位：${yLabel}`,
      });
    }
  }

  const unitless =
    input.unitless === true
    || extras.unitless === true
    || UNITLESS_TYPES.has(chartType);

  const encoding = { xLabel, yLabel, title: input.title, unitless: unitless || undefined };
  if (encodingNeedsUnit(encoding) && !unitless) {
    findings.push({
      code: "missing_unit",
      layer: "L0",
      action: "block",
      message: "y 轴标签缺少单位（用 产量 (kg/ha) 或显式 unitless）",
    });
  }

  const significance = parseSignificance(input.significance ?? extras.significance);
  const n = labels?.length ?? 0;
  if (significance && n > 0) {
    for (const mark of significance) {
      const idxs =
        "fromCategory" in mark
          ? [mark.fromCategory, mark.toCategory]
          : [mark.category];
      if (idxs.some((i) => i < 0 || i >= n)) {
        findings.push({
          code: "significance_oob",
          layer: "L0",
          action: "block",
          message: "显著性下标超出类别数",
        });
        break;
      }
    }
  }

  const presetRaw = String(input.preset ?? style.preset ?? extras.preset ?? "nature");
  const preset = isPreset(presetRaw) ? presetRaw : "nature";
  const columns = input.columns === 2 || Number(style.columns) >= 2 ? 2 : 1;
  const exportFormats: ChartExportFormat[] =
    input.exportFormats
    ?? (typeof style.export_formats === "string"
      ? style.export_formats.split(/[,;]/).map((s) => s.trim()).filter(Boolean) as ChartExportFormat[]
      : undefined)
    ?? ["png", "svg", "pdf"];

  const columnsSpec: ChartSpecColumns | undefined = xLabel || yCols.length
    ? {
        x: xLabel || "类别",
        y: yCols,
        errors: Object.keys(csvCols.errors).length > 0 ? csvCols.errors : undefined,
      }
    : undefined;

  const rot = style.x_tick_rotation ?? extras.x_tick_rotation;
  const layout: ChartSpecLayout = {
    legend: "auto",
    ...(typeof rot === "number" ? { xTickRotation: rot } : {}),
    ...(style.show_values === true || extras.show_values === true ? { showValues: true } : {}),
  };

  const caption = (input.caption || input.title || "图表").trim();
  const draft: ChartSpecV1 = {
    version: 1,
    archetype: archetypeFromTool("chart", chartType),
    chartType,
    claim: (input.claim || caption).trim(),
    data: {
      sourceKind: input.chartIndex != null
        ? "projectIndex"
        : input.csv
          ? "csv"
          : "inline",
      csv: input.csv,
      chartIndex: input.chartIndex,
      columns: columnsSpec,
      labels,
      datasets,
    },
    encoding,
    journal: {
      preset,
      columns,
      exportFormats: exportFormats.length ? exportFormats : ["png", "svg", "pdf"],
    },
    layout,
    caption,
  };
  if (significance) {
    draft.annotations = { significance };
  }

  const spec = parseChartSpec(draft);
  if (!spec) {
    throw new Error("compileChartSpec 产出了非法 ChartSpecV1");
  }
  return { spec, findings };
}

/** /plot 与 Agent 共用：从现有 config + CSV 文本升格 */
export function compileChartSpecFromLooseConfig(
  config: Record<string, unknown>,
  csvText: string,
): CompileChartSpecResult {
  const existing = parseChartSpec(config.chartSpec);
  if (existing) {
    return { spec: existing, findings: [] };
  }
  const style = isRecord(config.style) ? config.style : {};
  const data = isRecord(config.data) ? config.data : {};
  const labels = Array.isArray(data.labels) ? data.labels.map((l) => String(l)) : undefined;
  let datasets: ChartSpecSeries[] | undefined;
  if (Array.isArray(data.datasets)) {
    datasets = [];
    for (const item of data.datasets) {
      if (!isRecord(item) || !Array.isArray(item.data)) continue;
      const nums = item.data.map((v) => (typeof v === "number" ? v : Number(v)));
      if (nums.some((n) => Number.isNaN(n))) continue;
      datasets.push({
        label: typeof item.label === "string" ? item.label : "数据",
        data: nums,
      });
    }
    if (datasets.length === 0) datasets = undefined;
  }
  return compileChartSpec({
    chartType: String(config.chart_type ?? config.type ?? "bar_grouped"),
    csv: csvText,
    title: typeof config.title === "string" ? config.title : undefined,
    caption: typeof config.caption === "string" ? config.caption : undefined,
    xLabel: typeof config.x_label === "string" ? config.x_label : typeof config.xLabel === "string" ? config.xLabel : undefined,
    yLabel: typeof config.y_label === "string" ? config.y_label : typeof config.yLabel === "string" ? config.yLabel : undefined,
    preset: typeof style.preset === "string" ? style.preset : typeof config.preset === "string" ? config.preset : undefined,
    columns: Number(style.columns ?? config.columns) >= 2 ? 2 : 1,
    significance: config.significance,
    extras: config,
    labels,
    datasets,
    chartIndex: typeof config.chartIndex === "number" ? config.chartIndex : undefined,
  });
}

/** ChartSpec → Python / matplotlib 仍能读的 config（含 chartSpec 字段） */
export function chartSpecToPlotConfig(spec: ChartSpecV1): Record<string, unknown> {
  const figure = chartSpecToFigureSpec(spec);
  const style = isRecord(figure.config.style) ? { ...figure.config.style } : {};
  if (spec.layout?.legend && spec.layout.legend !== "auto") {
    style.legend_loc = spec.layout.legend;
  }
  return {
    ...figure.config,
    chart_type: spec.chartType,
    style,
    chartSpec: spec,
  };
}

/** 把编译结果挂到出图 config 上，不覆盖仪器/示意专用字段 */
export function attachCompiledSpec(
  config: Record<string, unknown>,
  csvText: string,
): { config: Record<string, unknown>; findings: ChartQaFinding[] } {
  const compiled = compileChartSpecFromLooseConfig(config, csvText);
  const fromSpec = chartSpecToPlotConfig(compiled.spec);
  return {
    config: {
      ...config,
      ...fromSpec,
      // 保留调用方额外键（dual_y 等），但 chartSpec / 轴标以编译结果为准
      chartSpec: compiled.spec,
      chartSpecL0: {
        verdict: verdictFromFindings(compiled.findings),
        findings: compiled.findings,
      },
    },
    findings: compiled.findings,
  };
}
