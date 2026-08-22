/**
 * ChartSpec V1 — 出图中间表示（FIG-QA-001）。
 * Agent / /plot 提交语义意图；旧 FigureSpec 经适配器升格，不立刻删除。
 * Python 镜像：scripts/charts/chart_spec.py（字段名必须一致）。
 */

import type { ChartExportFormat, ChartStylePreset } from "@/contracts/chart-style";
import { CHART_STYLE_PRESET_LABELS } from "@/contracts/chart-style";
import type { FigureSpec, PlotReplayTool } from "@/contracts/figure";
import {
  decodeFigureSpecParam,
  figureToolToRegistryId,
  isPlotReplayTool,
} from "@/contracts/figure";

export const CHART_SPEC_VERSION = 1 as const;

export type ChartArchetype = "quantitative" | "schematic" | "instrument" | "dft";

export type ChartErrorKind = "sd" | "se" | "ci";

export type ChartDataSourceKind = "csv" | "projectIndex" | "peaks" | "vasp" | "inline";

export type ChartLegendPlacement = "auto" | "outer-right" | "outer-bottom" | "none";

export interface ChartSpecColumns {
  x: string;
  y: string[];
  errors?: Record<string, ChartErrorKind>;
}

export interface ChartSpecSeries {
  label: string;
  data: number[];
  errors?: number[];
}

export interface ChartSpecData {
  sourceKind: ChartDataSourceKind;
  csv?: string;
  chartIndex?: number;
  columns?: ChartSpecColumns;
  /** 旧 FigureSpec 回放：已解析的 labels/datasets */
  labels?: string[];
  datasets?: ChartSpecSeries[];
}

export interface ChartSpecEncoding {
  xLabel: string;
  yLabel: string;
  title?: string;
  /** true=明确无量纲；未设且标签无单位 → L0 missing_unit */
  unitless?: boolean;
  series?: string[];
}

export interface ChartSpecJournal {
  preset: ChartStylePreset;
  columns: 1 | 2;
  exportFormats: ChartExportFormat[];
}

export type SignificanceMark =
  | { category: number; series?: number; value: string; label?: string }
  | { fromCategory: number; toCategory: number; value: string; label?: string };

export interface ChartSpecAnnotations {
  significance?: SignificanceMark[];
  panelLabel?: string;
}

export interface ChartSpecLayout {
  xTickRotation?: number;
  legend: ChartLegendPlacement;
  showValues?: boolean;
}

export interface ChartSpecV1 {
  version: 1;
  archetype: ChartArchetype;
  chartType: string;
  /** 这张图要辩护的一句话；适配器可先填 caption */
  claim: string;
  data: ChartSpecData;
  encoding: ChartSpecEncoding;
  journal: ChartSpecJournal;
  annotations?: ChartSpecAnnotations;
  layout?: ChartSpecLayout;
  caption: string;
}

const ARCHETYPES = new Set<string>(["quantitative", "schematic", "instrument", "dft"]);
const SOURCE_KINDS = new Set<string>(["csv", "projectIndex", "peaks", "vasp", "inline"]);
const ERROR_KINDS = new Set<string>(["sd", "se", "ci"]);
const LEGENDS = new Set<string>(["auto", "outer-right", "outer-bottom", "none"]);
const EXPORTS = new Set<string>(["png", "svg", "pdf", "tiff"]);
const PRESETS = new Set<string>(Object.keys(CHART_STYLE_PRESET_LABELS));

const UNIT_RE = /[（(][^）)]+[）)]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** 轴标签是否已带单位（括号约定，如 产量 (kg/ha)） */
export function hasAxisUnit(label: string): boolean {
  return UNIT_RE.test(label.trim());
}

export function encodingNeedsUnit(encoding: ChartSpecEncoding): boolean {
  if (encoding.unitless) return false;
  const x = encoding.xLabel.trim();
  const y = encoding.yLabel.trim();
  if (!y) return true;
  return !hasAxisUnit(y) && !hasAxisUnit(x);
}

function isStylePreset(value: string): value is ChartStylePreset {
  return PRESETS.has(value);
}

function isExportFormat(value: string): value is ChartExportFormat {
  return EXPORTS.has(value);
}

function parseErrorKind(raw: unknown): ChartErrorKind | null {
  return typeof raw === "string" && ERROR_KINDS.has(raw) ? (raw as ChartErrorKind) : null;
}

function parseColumns(raw: unknown): ChartSpecColumns | undefined {
  if (!isRecord(raw) || typeof raw.x !== "string" || !Array.isArray(raw.y)) return undefined;
  const y = raw.y.filter((v): v is string => typeof v === "string" && v.trim().length > 0);
  if (y.length === 0) return undefined;
  let errors: Record<string, ChartErrorKind> | undefined;
  if (isRecord(raw.errors)) {
    errors = {};
    for (const [key, val] of Object.entries(raw.errors)) {
      const kind = parseErrorKind(val);
      if (kind) errors[key] = kind;
    }
    if (Object.keys(errors).length === 0) errors = undefined;
  }
  return { x: raw.x, y, errors };
}

function parseSeriesList(raw: unknown): ChartSpecSeries[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: ChartSpecSeries[] = [];
  for (const item of raw) {
    if (!isRecord(item) || !Array.isArray(item.data)) continue;
    const data = item.data.map((v) => (typeof v === "number" ? v : Number(v)));
    if (data.some((n) => Number.isNaN(n))) continue;
    let errors: number[] | undefined;
    if (Array.isArray(item.errors)) {
      const nums = item.errors.map((v) => (typeof v === "number" ? v : Number(v)));
      if (nums.length === data.length && !nums.some((n) => Number.isNaN(n))) {
        errors = nums;
      }
    }
    out.push({
      label: typeof item.label === "string" ? item.label : "数据",
      data,
      errors,
    });
  }
  return out.length > 0 ? out : undefined;
}

function parseSignificance(raw: unknown): SignificanceMark[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: SignificanceMark[] = [];
  for (const item of raw) {
    if (!isRecord(item) || typeof item.value !== "string" || !item.value.trim()) continue;
    const label = typeof item.label === "string" ? item.label : undefined;
    const from = item.fromCategory;
    const to = item.toCategory;
    if (typeof from === "number" && typeof to === "number") {
      out.push({ fromCategory: from, toCategory: to, value: item.value.trim(), label });
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

function parseJournal(raw: unknown): ChartSpecJournal | null {
  if (!isRecord(raw)) return null;
  const preset = typeof raw.preset === "string" && isStylePreset(raw.preset) ? raw.preset : null;
  if (!preset) return null;
  const cols = raw.columns === 2 ? 2 : raw.columns === 1 ? 1 : null;
  if (cols == null) return null;
  const formats: ChartExportFormat[] = [];
  const exportRaw = raw.exportFormats ?? raw.export_formats;
  if (Array.isArray(exportRaw)) {
    for (const f of exportRaw) {
      if (typeof f === "string" && isExportFormat(f) && !formats.includes(f)) formats.push(f);
    }
  } else if (typeof exportRaw === "string") {
    for (const part of exportRaw.split(/[,;]/)) {
      const f = part.trim();
      if (isExportFormat(f) && !formats.includes(f)) formats.push(f);
    }
  }
  if (formats.length === 0) formats.push("png", "svg", "pdf");
  return { preset, columns: cols, exportFormats: formats };
}

function parseData(raw: unknown): ChartSpecData | null {
  if (!isRecord(raw) || typeof raw.sourceKind !== "string" || !SOURCE_KINDS.has(raw.sourceKind)) {
    return null;
  }
  const data: ChartSpecData = { sourceKind: raw.sourceKind as ChartDataSourceKind };
  if (typeof raw.csv === "string" && raw.csv.trim()) data.csv = raw.csv;
  if (typeof raw.chartIndex === "number" && Number.isFinite(raw.chartIndex)) {
    data.chartIndex = Math.floor(raw.chartIndex);
  }
  const columns = parseColumns(raw.columns);
  if (columns) data.columns = columns;
  if (Array.isArray(raw.labels)) {
    data.labels = raw.labels.map((l) => String(l));
  }
  const datasets = parseSeriesList(raw.datasets);
  if (datasets) data.datasets = datasets;
  return data;
}

function parseEncoding(raw: unknown): ChartSpecEncoding | null {
  if (!isRecord(raw) || typeof raw.xLabel !== "string" || typeof raw.yLabel !== "string") {
    return null;
  }
  const encoding: ChartSpecEncoding = {
    xLabel: raw.xLabel,
    yLabel: raw.yLabel,
  };
  if (typeof raw.title === "string") encoding.title = raw.title;
  if (raw.unitless === true) encoding.unitless = true;
  if (Array.isArray(raw.series)) {
    encoding.series = raw.series.filter((s): s is string => typeof s === "string");
  }
  return encoding;
}

function parseLayout(raw: unknown): ChartSpecLayout | undefined {
  if (!isRecord(raw)) return undefined;
  const legend = typeof raw.legend === "string" && LEGENDS.has(raw.legend)
    ? (raw.legend as ChartLegendPlacement)
    : "auto";
  const layout: ChartSpecLayout = { legend };
  if (typeof raw.xTickRotation === "number" && Number.isFinite(raw.xTickRotation)) {
    layout.xTickRotation = raw.xTickRotation;
  }
  if (typeof raw.showValues === "boolean") layout.showValues = raw.showValues;
  return layout;
}

/** 严格解析未知 JSON → ChartSpecV1；失败返回 null */
export function parseChartSpec(raw: unknown): ChartSpecV1 | null {
  if (!isRecord(raw)) return null;
  if (raw.version !== 1) return null;
  if (typeof raw.archetype !== "string" || !ARCHETYPES.has(raw.archetype)) return null;
  if (typeof raw.chartType !== "string" || !raw.chartType.trim()) return null;
  if (typeof raw.claim !== "string") return null;
  if (typeof raw.caption !== "string") return null;
  const data = parseData(raw.data);
  const encoding = parseEncoding(raw.encoding);
  const journal = parseJournal(raw.journal);
  if (!data || !encoding || !journal) return null;

  const spec: ChartSpecV1 = {
    version: 1,
    archetype: raw.archetype as ChartArchetype,
    chartType: raw.chartType.trim(),
    claim: raw.claim,
    data,
    encoding,
    journal,
    caption: raw.caption,
  };
  const significance = parseSignificance(
    isRecord(raw.annotations) ? raw.annotations.significance : undefined,
  );
  const panelLabel =
    isRecord(raw.annotations) && typeof raw.annotations.panelLabel === "string"
      ? raw.annotations.panelLabel
      : undefined;
  if (significance || panelLabel) {
    spec.annotations = { significance, panelLabel };
  }
  const layout = parseLayout(raw.layout);
  if (layout) spec.layout = layout;
  return spec;
}

export function isChartSpecV1(value: unknown): value is ChartSpecV1 {
  return parseChartSpec(value) !== null;
}

export function archetypeFromTool(tool: string, chartType?: string): ChartArchetype {
  if (tool.startsWith("xrd_") || chartType?.startsWith("xrd_")) return "instrument";
  if (tool.startsWith("dft_") || chartType?.startsWith("dft_")) return "dft";
  if (
    tool === "flow"
    || tool === "mechanism"
    || tool === "mechanism_panel"
    || tool === "molecule"
    || chartType === "flow"
    || chartType === "mechanism"
    || chartType === "mechanism_panel"
    || chartType === "molecule"
  ) {
    return "schematic";
  }
  return "quantitative";
}

function toolFromSpec(spec: ChartSpecV1): PlotReplayTool {
  const t = spec.chartType;
  if (isPlotReplayTool(t)) return t;
  if (spec.archetype === "schematic") {
    if (t === "flow") return "flow";
    if (t === "molecule") return "molecule";
    if (t === "mechanism_panel") return "mechanism_panel";
    return "mechanism";
  }
  if (spec.archetype === "instrument" && isPlotReplayTool(t)) return t;
  if (spec.archetype === "dft" && isPlotReplayTool(t)) return t;
  return "chart";
}

function styleFromFigureConfig(config: Record<string, unknown>): Record<string, unknown> {
  return isRecord(config.style) ? config.style : {};
}

function inferJournal(style: Record<string, unknown>): ChartSpecJournal {
  const presetRaw = typeof style.preset === "string" ? style.preset : "nature";
  const preset = isStylePreset(presetRaw) ? presetRaw : "nature";
  const columns = Number(style.columns) >= 2 ? 2 : 1;
  const formats: ChartExportFormat[] = [];
  const raw = style.export_formats ?? style.exportFormats;
  if (Array.isArray(raw)) {
    for (const f of raw) {
      if (typeof f === "string" && isExportFormat(f) && !formats.includes(f)) formats.push(f);
    }
  } else if (typeof raw === "string") {
    for (const part of raw.split(/[,;]/)) {
      const f = part.trim().toLowerCase();
      if (isExportFormat(f) && !formats.includes(f)) formats.push(f);
    }
  }
  if (formats.length === 0) formats.push("png", "svg", "pdf");
  return { preset, columns, exportFormats: formats };
}

function inferColumnsFromDatasets(
  xLabel: string,
  datasets: ChartSpecSeries[],
): ChartSpecColumns | undefined {
  if (datasets.length === 0) return undefined;
  return {
    x: xLabel.trim() || "类别",
    y: datasets.map((d) => d.label),
  };
}

/** 旧 FigureSpec → ChartSpecV1；无法识别返回 null */
export function figureSpecToChartSpec(spec: FigureSpec): ChartSpecV1 | null {
  if (!isRecord(spec.config)) return null;
  const config = spec.config;
  const chartType = figureToolToRegistryId(spec.tool, config);
  if (!chartType) return null;

  const style = styleFromFigureConfig(config);
  const xLabel =
    typeof config.x_label === "string"
      ? config.x_label
      : typeof config.xLabel === "string"
        ? config.xLabel
        : "";
  const yLabel =
    typeof config.y_label === "string"
      ? config.y_label
      : typeof config.yLabel === "string"
        ? config.yLabel
        : "";
  const title = typeof config.title === "string" ? config.title : spec.caption;

  const dataBlob = isRecord(config.data) ? config.data : null;
  const labels = dataBlob && Array.isArray(dataBlob.labels)
    ? dataBlob.labels.map((l) => String(l))
    : undefined;
  const datasets = dataBlob ? parseSeriesList(dataBlob.datasets) : undefined;

  const data: ChartSpecData = { sourceKind: "inline" };
  if (labels) data.labels = labels;
  if (datasets) data.datasets = datasets;
  const columns = inferColumnsFromDatasets(xLabel, datasets ?? []);
  if (columns) data.columns = columns;
  if (typeof config.csv === "string" && config.csv.trim()) {
    data.sourceKind = "csv";
    data.csv = config.csv;
  }
  if (typeof config.chartIndex === "number" && Number.isFinite(config.chartIndex)) {
    data.sourceKind = "projectIndex";
    data.chartIndex = Math.floor(config.chartIndex);
  }

  const rot = style.x_tick_rotation ?? style.xTickRotation ?? config.x_tick_rotation;
  const layout: ChartSpecLayout = { legend: "auto" };
  if (typeof rot === "number" && Number.isFinite(rot)) layout.xTickRotation = rot;
  if (style.show_values === true || style.showValues === true || config.show_values === true) {
    layout.showValues = true;
  }

  const significance = parseSignificance(config.significance);
  const panelLabel =
    typeof style.panel_label === "string"
      ? style.panel_label
      : typeof config.panel_label === "string"
        ? config.panel_label
        : undefined;

  const lifted: ChartSpecV1 = {
    version: 1,
    archetype: archetypeFromTool(spec.tool, chartType),
    chartType,
    claim: spec.caption || title,
    data,
    encoding: { xLabel, yLabel, title },
    journal: inferJournal(style),
    layout,
    caption: spec.caption,
  };
  if (significance || panelLabel) {
    lifted.annotations = { significance, panelLabel };
  }
  return parseChartSpec(lifted);
}

/** ChartSpec → 旧 FigureSpec（/plot 回放仍走现有 prefill） */
export function chartSpecToFigureSpec(spec: ChartSpecV1): FigureSpec {
  const tool = toolFromSpec(spec);
  const config: Record<string, unknown> = {
    type: spec.chartType,
    chart_type: spec.chartType,
    title: spec.encoding.title || spec.claim || spec.caption,
    x_label: spec.encoding.xLabel,
    y_label: spec.encoding.yLabel,
    style: {
      preset: spec.journal.preset,
      columns: spec.journal.columns,
      export_formats: spec.journal.exportFormats.join(","),
      ...(spec.layout?.xTickRotation != null ? { x_tick_rotation: spec.layout.xTickRotation } : {}),
      ...(spec.layout?.showValues != null ? { show_values: spec.layout.showValues } : {}),
      ...(spec.annotations?.panelLabel ? { panel_label: spec.annotations.panelLabel } : {}),
    },
  };
  if (spec.data.labels || spec.data.datasets) {
    config.data = {
      labels: spec.data.labels ?? [],
      datasets: (spec.data.datasets ?? []).map((d) => ({
        label: d.label,
        data: d.data,
        ...(d.errors ? { errors: d.errors } : {}),
      })),
    };
  }
  if (spec.data.csv) config.csv = spec.data.csv;
  if (spec.data.chartIndex != null) config.chartIndex = spec.data.chartIndex;
  if (spec.annotations?.significance) config.significance = spec.annotations.significance;
  return { tool, caption: spec.caption, config };
}

function decodeBase64UrlJson(encoded: string): unknown | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padLen = (4 - (padded.length % 4)) % 4;
    const base64 = padded + "=".repeat(padLen);
    let json: string;
    if (typeof Buffer !== "undefined") {
      json = Buffer.from(base64, "base64").toString("utf8");
    } else {
      const binary = atob(base64);
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      json = new TextDecoder().decode(bytes);
    }
    return JSON.parse(json) as unknown;
  } catch {
    return null;
  }
}

function encodeJsonBase64Url(value: unknown): string {
  const text = JSON.stringify(value);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  }
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 新格式：直接编码 ChartSpecV1（007 起写入；001 仅供测试与预览） */
export function encodeChartSpecEnc(spec: ChartSpecV1): string {
  return encodeJsonBase64Url(spec);
}

/**
 * 解码 figureSpecEnc：先认 ChartSpecV1，再回退旧 FigureSpec 升格。
 * 不改变现网 encodeFigureSpecParam 的写入格式（007 再切主路径）。
 */
export function decodeChartSpecEnc(encoded: string): ChartSpecV1 | null {
  const trimmed = encoded.trim();
  if (!trimmed) return null;
  try {
    const asJson: unknown = JSON.parse(trimmed);
    const direct = parseChartSpec(asJson);
    if (direct) return direct;
  } catch {
    // 不是裸 JSON
  }
  const fromB64 = decodeBase64UrlJson(trimmed);
  if (fromB64) {
    const spec = parseChartSpec(fromB64);
    if (spec) return spec;
  }
  const figure = decodeFigureSpecParam(trimmed);
  return figure ? figureSpecToChartSpec(figure) : null;
}
