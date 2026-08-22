/**
 * FIG-QA-009：刊规包 + 导出清单。
 * 栏宽 mm 与 scripts/charts/plot_style.py JOURNAL_COLUMN_WIDTH_MM 对齐。
 */

import type { ChartQaReport, ChartQaVerdict } from "@/contracts/chart-qa";
import type { ChartExportFormat, ChartStylePreset } from "@/contracts/chart-style";

export const MM_PER_INCH = 25.4;

export const JOURNAL_COLUMN_WIDTH_MM: Record<string, {
  single: number;
  double: number;
  maxHeight: number;
}> = {
  nature: { single: 89.0, double: 183.0, maxHeight: 247.0 },
  science: { single: 55.0, double: 120.0, maxHeight: 247.0 },
  ieee: { single: 88.9, double: 181.0, maxHeight: 247.0 },
  acs: { single: 82.5, double: 178.0, maxHeight: 240.0 },
  elsevier: { single: 90.0, double: 190.0, maxHeight: 240.0 },
  agr_journal: { single: 80.0, double: 170.0, maxHeight: 240.0 },
  agr_cn: { single: 80.0, double: 165.0, maxHeight: 235.0 },
};

interface PresetMeta {
  journalKey: string;
  defaultColumns: 1 | 2;
  dpi: number;
  fontPt: number;
  exportFormats: ChartExportFormat[];
  /** slide 等不走栏宽 mm */
  widthInOverride?: number;
}

const PRESET_META: Record<ChartStylePreset, PresetMeta> = {
  nature: { journalKey: "nature", defaultColumns: 1, dpi: 300, fontPt: 7, exportFormats: ["png", "svg", "pdf"] },
  agr_journal: { journalKey: "agr_journal", defaultColumns: 2, dpi: 300, fontPt: 9, exportFormats: ["png", "svg", "pdf"] },
  agr_cn: { journalKey: "agr_cn", defaultColumns: 2, dpi: 300, fontPt: 9, exportFormats: ["png", "svg", "pdf"] },
  ieee: { journalKey: "ieee", defaultColumns: 1, dpi: 600, fontPt: 8, exportFormats: ["png", "svg", "pdf", "tiff"] },
  acs: { journalKey: "acs", defaultColumns: 1, dpi: 300, fontPt: 8, exportFormats: ["png", "svg", "pdf", "tiff"] },
  elsevier: { journalKey: "elsevier", defaultColumns: 2, dpi: 300, fontPt: 8, exportFormats: ["png", "svg", "pdf"] },
  print_bw: { journalKey: "nature", defaultColumns: 1, dpi: 600, fontPt: 8, exportFormats: ["png", "svg", "pdf", "tiff"] },
  slide: {
    journalKey: "nature",
    defaultColumns: 2,
    dpi: 200,
    fontPt: 14,
    exportFormats: ["png"],
    widthInOverride: 10,
  },
};

export interface ChartJournalPack {
  preset: ChartStylePreset;
  journalKey: string;
  columns: 1 | 2;
  widthMm: number;
  widthIn: number;
  maxHeightMm: number;
  dpi: number;
  fontPt: number;
  exportFormats: ChartExportFormat[];
}

export interface ChartExportFiles {
  png: string;
  svg?: string;
  pdf?: string;
  tiff?: string;
  csv?: string;
  manifest: string;
}

export interface ChartExportQaSummary {
  verdict: ChartQaVerdict;
  findingCodes: string[];
  blockCodes: string[];
}

export interface ChartExportManifest {
  version: 1;
  chartType?: string;
  caption?: string;
  claim?: string;
  journal: ChartJournalPack;
  files: ChartExportFiles;
  qa: ChartExportQaSummary;
  /** matplotlib 实际 fig_width（inch），供对照刊规 ±8% */
  actualWidthIn?: number;
}

export function mmToInch(mm: number): number {
  return Math.round((mm / MM_PER_INCH) * 1000) / 1000;
}

export function isChartStylePreset(value: string): value is ChartStylePreset {
  return value in PRESET_META;
}

export function resolveJournalPack(
  presetRaw: string | undefined,
  columnsRaw?: number,
  exportFormats?: ChartExportFormat[],
): ChartJournalPack {
  const raw = presetRaw ?? "";
  const preset: ChartStylePreset = isChartStylePreset(raw) ? raw : "nature";
  const meta = PRESET_META[preset];
  const columns: 1 | 2 = columnsRaw != null && Number(columnsRaw) >= 2 ? 2 : meta.defaultColumns;
  const widths = JOURNAL_COLUMN_WIDTH_MM[meta.journalKey] ?? JOURNAL_COLUMN_WIDTH_MM.nature;
  const widthMm = columns === 2 ? widths.double : widths.single;
  const widthIn = meta.widthInOverride ?? mmToInch(widthMm);
  return {
    preset,
    journalKey: meta.journalKey,
    columns,
    widthMm: meta.widthInOverride ? Math.round(meta.widthInOverride * MM_PER_INCH * 10) / 10 : widthMm,
    widthIn,
    maxHeightMm: widths.maxHeight,
    dpi: meta.dpi,
    fontPt: meta.fontPt,
    exportFormats: exportFormats && exportFormats.length > 0 ? exportFormats : meta.exportFormats,
  };
}

/** 实际图宽是否落在刊规 ±tol（默认 8%） */
export function journalWidthWithinTol(actualIn: number, pack: ChartJournalPack, tol = 0.08): boolean {
  if (!(pack.widthIn > 0) || !Number.isFinite(actualIn)) return false;
  return Math.abs(actualIn - pack.widthIn) / pack.widthIn <= tol;
}

export function summarizeChartQa(report: ChartQaReport | undefined): ChartExportQaSummary {
  const findings = report?.findings ?? [];
  return {
    verdict: report?.verdict ?? "pass",
    findingCodes: findings.map((f) => f.code).filter(Boolean),
    blockCodes: findings.filter((f) => f.action === "block").map((f) => f.code),
  };
}

export function buildChartExportManifest(input: {
  baseName: string;
  chartType?: string;
  caption?: string;
  claim?: string;
  journal: ChartJournalPack;
  qa?: ChartQaReport;
  hasSvg?: boolean;
  hasPdf?: boolean;
  hasTiff?: boolean;
  hasCsv?: boolean;
  actualWidthIn?: number;
}): ChartExportManifest {
  const files: ChartExportFiles = {
    png: `/api/charts/${input.baseName}.png`,
    manifest: `/api/charts/${input.baseName}.json`,
  };
  if (input.hasSvg) files.svg = `/api/charts/${input.baseName}.svg`;
  if (input.hasPdf) files.pdf = `/api/charts/${input.baseName}.pdf`;
  if (input.hasTiff) files.tiff = `/api/charts/${input.baseName}.tiff`;
  if (input.hasCsv) files.csv = `/api/charts/${input.baseName}.csv`;
  return {
    version: 1,
    chartType: input.chartType,
    caption: input.caption,
    claim: input.claim,
    journal: input.journal,
    files,
    qa: summarizeChartQa(input.qa),
    actualWidthIn: input.actualWidthIn,
  };
}

export function parseChartExportManifest(raw: unknown): ChartExportManifest | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1 || !o.journal || typeof o.journal !== "object" || !o.files || typeof o.files !== "object") {
    return null;
  }
  const files = o.files as Record<string, unknown>;
  if (typeof files.png !== "string" || typeof files.manifest !== "string") return null;
  return raw as ChartExportManifest;
}
