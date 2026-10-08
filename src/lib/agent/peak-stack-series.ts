/**
 * 特征峰叠图的取数与对齐。
 * 只读已入库曲线，不从模型粘贴的谱里抽点，也不编峰位归属。
 */

import type { DataSourceAnalysis } from "@/contracts/data-source";

export const PEAK_STACK_MAX_SERIES = 12;
export const PEAK_STACK_MAX_POINTS = 480;
const MIN_CURVE_POINTS = 20;

export type PeakMarker = "diamond" | "triangle" | "star" | "circle";

export interface PeakStackSeries {
  name: string;
  x: number[];
  y: number[];
}

export interface PeakMark {
  x: number;
  label: string;
  marker: PeakMarker;
  series?: string;
}

export interface GuideMark {
  x: number;
  label: string;
}

const MARKERS: readonly PeakMarker[] = ["diamond", "triangle", "star", "circle"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGenericSeriesLabel(label: string): boolean {
  const text = label.trim().toLowerCase().replace(/\s+/g, " ");
  return /^(y|value|values|data|series|intensity|counts|absorbance|counts \/ s|counts\/s|arbitrary|a\.u\.)$/.test(text);
}

export function shortSourceLabel(fileName: string): string {
  const parts = fileName.split(" · ");
  const last = parts[parts.length - 1] ?? fileName;
  return last.replace(/\.[^.]+$/, "").trim() || fileName;
}

export function parseStoredSources(raw: string): DataSourceAnalysis[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is DataSourceAnalysis =>
      isRecord(item) && typeof item.fileName === "string",
    );
  } catch {
    return [];
  }
}

export function parseSourceFileNames(raw: string): string[] {
  const text = raw.trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(text);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item).trim())
          .filter(Boolean)
          .slice(0, PEAK_STACK_MAX_SERIES);
      }
    } catch {
      /* 按分隔符继续 */
    }
  }
  return text
    .split(/[,，\n]/)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, PEAK_STACK_MAX_SERIES);
}

function sourceMatches(fileName: string, query: string): boolean {
  const stored = fileName.trim();
  const name = query.trim();
  if (!stored || !name) return false;
  if (stored === name) return true;
  if (stored.startsWith(`${name} ·`)) return true;
  if (stored.endsWith(` · ${name}`)) return true;
  const stem = stored.replace(/\.[^.]+$/, "");
  return stem === name;
}

export function seriesFromSource(source: DataSourceAnalysis): PeakStackSeries[] {
  const out: PeakStackSeries[] = [];
  const fileLabel = shortSourceLabel(source.fileName);
  const configs = Array.isArray(source.chartConfigs) ? source.chartConfigs : [];
  for (const config of configs) {
    if (config.type !== "line" && config.type !== "scatter") continue;
    if (!Array.isArray(config.labels) || !Array.isArray(config.datasets)) continue;
    const xAll = config.labels.map((label) => Number(label));
    for (const dataset of config.datasets) {
      const n = Math.min(xAll.length, dataset.data.length);
      const x: number[] = [];
      const y: number[] = [];
      for (let i = 0; i < n; i++) {
        const xv = xAll[i];
        const yv = dataset.data[i];
        if (xv == null || yv == null || !Number.isFinite(xv) || !Number.isFinite(yv)) continue;
        x.push(xv);
        y.push(yv);
      }
      if (x.length < MIN_CURVE_POINTS) continue;
      const column = dataset.label.trim();
      const name = isGenericSeriesLabel(column) ? fileLabel : (column || fileLabel);
      out.push({ name, x, y });
    }
  }
  return out;
}

export function collectPeakStackSeries(
  sources: readonly DataSourceAnalysis[],
  names: readonly string[],
): { series: PeakStackSeries[]; missing: string[]; truncated: boolean } {
  const series: PeakStackSeries[] = [];
  const missing: string[] = [];
  for (const name of names) {
    const hits = sources.filter((source) => sourceMatches(source.fileName, name));
    if (hits.length === 0) {
      missing.push(name);
      continue;
    }
    let added = 0;
    for (const hit of hits) {
      const found = seriesFromSource(hit);
      if (found.length === 0) continue;
      series.push(...found);
      added += found.length;
    }
    if (added === 0) missing.push(name);
  }
  const used = new Set<string>();
  const unique = series.map((item) => {
    const base = item.name.trim() || "谱线";
    let name = base;
    let n = 2;
    while (used.has(name)) {
      name = `${base} ${n}`;
      n += 1;
    }
    used.add(name);
    return { ...item, name };
  });
  return {
    series: unique.slice(0, PEAK_STACK_MAX_SERIES),
    missing,
    truncated: unique.length > PEAK_STACK_MAX_SERIES,
  };
}

function asMarker(raw: string, index: number): PeakMarker {
  const text = raw.trim().toLowerCase();
  if (MARKERS.includes(text as PeakMarker)) return text as PeakMarker;
  return MARKERS[index % MARKERS.length] ?? "diamond";
}

export function parsePeakMarks(raw: string): { peaks: PeakMark[] } | { error: string } {
  const text = raw.trim();
  if (!text) return { peaks: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "peaksJson 不是合法 JSON" };
  }
  if (!Array.isArray(parsed)) return { error: "peaksJson 必须是数组" };
  if (parsed.length > 24) return { error: "峰标记最多 24 个" };
  const peaks: PeakMark[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) return { error: "每个峰标记都要是对象" };
    const x = Number(item.x);
    if (!Number.isFinite(x)) return { error: "每个峰标记都要有数字 x，不要写无法定位的名称" };
    const series = String(item.series ?? "").trim();
    peaks.push({
      x,
      label: String(item.label ?? "").trim(),
      marker: asMarker(String(item.marker ?? ""), peaks.length),
      ...(series ? { series } : {}),
    });
  }
  return { peaks };
}

export function parseGuideMarks(raw: string): { guides: GuideMark[] } | { error: string } {
  const text = raw.trim();
  if (!text) return { guides: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "guidesJson 不是合法 JSON" };
  }
  if (!Array.isArray(parsed)) return { error: "guidesJson 必须是数组" };
  if (parsed.length > 16) return { error: "参考线最多 16 条" };
  const guides: GuideMark[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) return { error: "每条参考线都要是对象" };
    const x = Number(item.x);
    if (!Number.isFinite(x)) return { error: "每条参考线都要有数字 x" };
    guides.push({ x, label: String(item.label ?? "").trim() });
  }
  return { guides };
}

export type PeakStackKind = "xrd" | "ir" | "raman" | "xps";

export function isPeakStackKind(value: string): value is PeakStackKind {
  return value === "xrd" || value === "ir" || value === "raman" || value === "xps";
}

export function axisForKind(
  kind: PeakStackKind,
  override: { xLabel?: string; yLabel?: string },
): { xLabel: string; yLabel: string; xReverse: boolean } {
  if (kind === "ir") {
    return {
      xLabel: override.xLabel?.trim() || "Wavenumber (cm-1)",
      yLabel: override.yLabel?.trim() || "Absorbance (a.u.)",
      xReverse: true,
    };
  }
  if (kind === "raman") {
    return {
      xLabel: override.xLabel?.trim() || "Raman shift (cm-1)",
      yLabel: override.yLabel?.trim() || "Intensity (a.u.)",
      xReverse: false,
    };
  }
  if (kind === "xps") {
    return {
      xLabel: override.xLabel?.trim() || "Binding energy (eV)",
      yLabel: override.yLabel?.trim() || "Intensity (a.u.)",
      xReverse: true,
    };
  }
  return {
    xLabel: override.xLabel?.trim() || "2θ (degree)",
    yLabel: override.yLabel?.trim() || "Intensity (a.u.)",
    xReverse: false,
  };
}

function toAscending(series: PeakStackSeries): PeakStackSeries {
  const pairs = series.x.map((x, i) => ({ x, y: series.y[i] ?? Number.NaN }));
  pairs.sort((a, b) => a.x - b.x);
  const x: number[] = [];
  const y: number[] = [];
  for (const pair of pairs) {
    if (!Number.isFinite(pair.x) || !Number.isFinite(pair.y)) continue;
    if (x.length > 0 && pair.x === x[x.length - 1]) {
      y[y.length - 1] = pair.y;
      continue;
    }
    x.push(pair.x);
    y.push(pair.y);
  }
  return { name: series.name, x, y };
}

function interpAt(x: number[], y: number[], xq: number): number {
  const first = x[0] ?? xq;
  const last = x[x.length - 1] ?? xq;
  if (xq <= first) return y[0] ?? 0;
  if (xq >= last) return y[y.length - 1] ?? 0;
  let lo = 0;
  let hi = x.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    const midX = x[mid] ?? last;
    if (midX <= xq) lo = mid;
    else hi = mid;
  }
  const x0 = x[lo] ?? first;
  const x1 = x[hi] ?? last;
  const y0 = y[lo] ?? 0;
  const y1 = y[hi] ?? 0;
  const span = x1 - x0;
  if (span === 0) return y0;
  const t = (xq - x0) / span;
  return y0 + t * (y1 - y0);
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function alignPeakStack(
  series: readonly PeakStackSeries[],
  crop?: { xMin?: number; xMax?: number },
): { csv: string; pointCount: number; xMin: number; xMax: number } | { error: string } {
  if (series.length === 0) return { error: "没有可叠的谱线" };
  const ordered = series.map(toAscending).filter((item) => item.x.length >= 2);
  if (ordered.length === 0) return { error: "谱线点数不够，无法叠图" };
  let lo = Number.NEGATIVE_INFINITY;
  let hi = Number.POSITIVE_INFINITY;
  for (const item of ordered) {
    lo = Math.max(lo, item.x[0] ?? lo);
    hi = Math.min(hi, item.x[item.x.length - 1] ?? hi);
  }
  if (crop?.xMin != null && Number.isFinite(crop.xMin)) lo = Math.max(lo, crop.xMin);
  if (crop?.xMax != null && Number.isFinite(crop.xMax)) hi = Math.min(hi, crop.xMax);
  if (!(hi > lo)) return { error: "这些谱的横轴范围对不上，没有可以叠在一起的区间" };

  const longest = ordered.reduce((best, item) => Math.max(best, item.x.length), 0);
  const count = Math.max(2, Math.min(PEAK_STACK_MAX_POINTS, longest));
  const step = count === 1 ? 0 : (hi - lo) / (count - 1);
  const xs = Array.from({ length: count }, (_, i) => lo + step * i);
  const header = ["x", ...ordered.map((item) => csvCell(item.name))].join(",");
  const rows = xs.map((x) => {
    const cells = ordered.map((item) => String(interpAt(item.x, item.y, x)));
    return [String(x), ...cells].join(",");
  });
  return {
    csv: [header, ...rows].join("\n"),
    pointCount: count,
    xMin: lo,
    xMax: hi,
  };
}
