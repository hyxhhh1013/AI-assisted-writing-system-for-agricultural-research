/**
 * 同一坐标上的多条曲线：热重、DTG、吸附等温线、孔径分布。
 * 每条曲线保留自己的 x，吸附回线不会被按横轴排序压扁。
 */

import type { PeakStackSeries } from "@/lib/agent/peak-stack-series";

export const OVERLAY_MAX_POINTS = 480;

export type OverlayKind = "tg" | "dtg" | "bet" | "pore";
export type OverlayTransform = "none" | "mass_percent" | "dtg" | "dv_dlog";

export function isOverlayKind(value: string): value is OverlayKind {
  return value === "tg" || value === "dtg" || value === "bet" || value === "pore";
}

export function defaultTransform(kind: OverlayKind): OverlayTransform {
  if (kind === "tg") return "mass_percent";
  if (kind === "dtg") return "dtg";
  return "none";
}

export function axisForOverlay(
  kind: OverlayKind,
  transform: OverlayTransform,
  perMinute: boolean,
): { xLabel: string; yLabel: string; xLog: boolean; markers: boolean } {
  if (kind === "dtg" || transform === "dtg") {
    return {
      xLabel: "Temperature (°C)",
      yLabel: perMinute ? "Derivative mass loss (%/min)" : "d(Mass)/dT (%/°C)",
      xLog: false,
      markers: false,
    };
  }
  if (kind === "tg" || transform === "mass_percent") {
    return {
      xLabel: "Temperature (°C)",
      yLabel: "Mass (%)",
      xLog: false,
      markers: false,
    };
  }
  if (kind === "pore") {
    return {
      xLabel: "Pore diameter (nm)",
      yLabel: transform === "dv_dlog" ? "dV/dlog(D) (cm3/g)" : "dV/dD (cm3/g/nm)",
      xLog: true,
      markers: true,
    };
  }
  return {
    xLabel: "Relative pressure (P/P0)",
    yLabel: "Quantity adsorbed (cm3/g)",
    xLog: false,
    markers: true,
  };
}

function finitePairs(series: PeakStackSeries): PeakStackSeries {
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < series.x.length; i++) {
    const xv = series.x[i];
    const yv = series.y[i];
    if (xv == null || yv == null || !Number.isFinite(xv) || !Number.isFinite(yv)) continue;
    x.push(xv);
    y.push(yv);
  }
  return { name: series.name, x, y };
}

function sortAscending(series: PeakStackSeries): PeakStackSeries {
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

export function downsampleSeries(series: PeakStackSeries, max = OVERLAY_MAX_POINTS): PeakStackSeries {
  if (series.x.length <= max) return series;
  const step = Math.ceil(series.x.length / max);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < series.x.length; i += step) {
    const xv = series.x[i];
    const yv = series.y[i];
    if (xv == null || yv == null) continue;
    x.push(xv);
    y.push(yv);
  }
  const last = series.x.length - 1;
  const lastX = series.x[last];
  const lastY = series.y[last];
  if (lastX != null && lastY != null && x[x.length - 1] !== lastX) {
    x.push(lastX);
    y.push(lastY);
  }
  return { name: series.name, x, y };
}

/** 以第一个非零点为 100%。已经在 0–110 且起点接近 100 的序列保持原值。 */
export function toMassPercent(series: PeakStackSeries): PeakStackSeries {
  const clean = finitePairs(series);
  const base = clean.y.find((value) => Number.isFinite(value) && value !== 0);
  if (base == null) return clean;
  const max = Math.max(...clean.y);
  const min = Math.min(...clean.y);
  if (base > 90 && base < 110 && max <= 110 && min >= -1) return clean;
  return { name: clean.name, x: clean.x, y: clean.y.map((value) => (100 * value) / base) };
}

/** 对已按温度排好的质量百分比做中心差分。rate 是 °C/min，给出时纵轴变成每分钟。 */
export function derivativeMass(series: PeakStackSeries, rate?: number): PeakStackSeries {
  const clean = sortAscending(toMassPercent(series));
  const y = clean.y.map((_, index) => {
    if (index === 0 || index === clean.y.length - 1) return Number.NaN;
    const x0 = clean.x[index - 1] ?? 0;
    const x1 = clean.x[index + 1] ?? 0;
    const y0 = clean.y[index - 1] ?? 0;
    const y1 = clean.y[index + 1] ?? 0;
    const dx = x1 - x0;
    if (dx === 0) return Number.NaN;
    const slope = (y1 - y0) / dx;
    return rate != null && rate > 0 ? slope * rate : slope;
  });
  if (y.length >= 2) {
    y[0] = y[1] ?? 0;
    y[y.length - 1] = y[y.length - 2] ?? 0;
  }
  return { name: clean.name, x: clean.x, y: y.map((value) => (Number.isFinite(value) ? value : 0)) };
}

/** dV/dD × D × ln(10) = dV/dlog10(D)。只在调用方确认 y 是 dV/dD 时使用。 */
export function toDvDlog(series: PeakStackSeries): PeakStackSeries {
  const clean = finitePairs(series);
  const ln10 = Math.log(10);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < clean.x.length; i++) {
    const xv = clean.x[i] ?? 0;
    const yv = clean.y[i] ?? 0;
    if (xv <= 0) continue;
    x.push(xv);
    y.push(yv * xv * ln10);
  }
  return { name: clean.name, x, y };
}

export function prepareOverlaySeries(
  series: readonly PeakStackSeries[],
  transform: OverlayTransform,
  rates: readonly (number | undefined)[],
): PeakStackSeries[] {
  return series.map((item, index) => {
    let next = finitePairs(item);
    if (transform === "mass_percent") next = toMassPercent(next);
    else if (transform === "dtg") next = derivativeMass(next, rates[index]);
    else if (transform === "dv_dlog") next = toDvDlog(next);
    else if (transform === "none") next = finitePairs(item);
    return downsampleSeries(next);
  }).filter((item) => item.x.length >= 2);
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

export function overlayLongCsv(series: readonly PeakStackSeries[]): string {
  const lines = ["series,x,y"];
  for (const item of series) {
    for (let i = 0; i < item.x.length; i++) {
      lines.push(`${csvCell(item.name)},${item.x[i]},${item.y[i]}`);
    }
  }
  return lines.join("\n");
}
