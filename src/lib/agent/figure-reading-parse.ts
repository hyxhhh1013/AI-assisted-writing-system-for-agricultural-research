/**
 * 已有图上读出的数值。只在用户确认后写成证据声明。
 */

import type { DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";

export interface FigureReading {
  series: string;
  x?: string;
  y: string;
  unit?: string;
}

export interface FigureReadingProposal {
  note: string;
  points: FigureReading[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseFigureReadingsJson(text: string): FigureReadingProposal {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return { note: "没有读出结构化数值", points: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { note: "读图结果不是有效 JSON", points: [] };
  }
  if (!isRecord(parsed)) return { note: "", points: [] };
  const note = String(parsed.note ?? "").trim().slice(0, 200);
  const rawPoints = Array.isArray(parsed.points) ? parsed.points : [];
  const points: FigureReading[] = [];
  for (const item of rawPoints) {
    if (!isRecord(item)) continue;
    const y = String(item.y ?? "").trim();
    const series = String(item.series ?? item.label ?? "").trim();
    if (!y || !series) continue;
    const x = String(item.x ?? "").trim();
    const unit = String(item.unit ?? "").trim();
    points.push({
      series: series.slice(0, 80),
      y: y.slice(0, 40),
      ...(x ? { x: x.slice(0, 40) } : {}),
      ...(unit ? { unit: unit.slice(0, 40) } : {}),
    });
    if (points.length >= 12) break;
  }
  return { note, points };
}

export function parseFigureReadingList(raw: unknown): FigureReading[] {
  if (!Array.isArray(raw)) return [];
  const points: FigureReading[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const series = String(item.series ?? "").trim();
    const y = String(item.y ?? "").trim();
    if (!series || !y) continue;
    const x = String(item.x ?? "").trim();
    const unit = String(item.unit ?? "").trim();
    points.push({
      series,
      y,
      ...(x ? { x } : {}),
      ...(unit ? { unit } : {}),
    });
  }
  return points;
}

function numericY(raw: string): number | null {
  const match = raw.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

export function figureReadingsToEvidence(
  fileName: string,
  sourceId: string,
  readings: FigureReading[],
): { analysis: DataSourceAnalysis; claims: EvidenceClaim[] } {
  const claims: EvidenceClaim[] = readings.map((reading, i) => {
    const yNum = numericY(reading.y);
    const where = reading.x ? `，横轴 ${reading.x}` : "";
    const unit = reading.unit ? ` ${reading.unit}` : "";
    return {
      id: `${sourceId}-C${i + 1}`,
      sourceId,
      sourceType: "data",
      type: "mean",
      text: `图「${fileName}」中 ${reading.series} 为 ${reading.y}${unit}${where}。该数值已经用户核对。`,
      values: {
        series: reading.series,
        ...(yNum != null ? { y: yNum } : { y: reading.y }),
        ...(reading.unit ? { unit: reading.unit } : {}),
        ...(reading.x ? { x: reading.x } : {}),
      },
      variables: [reading.series],
      tolerance: 0.5,
    };
  });
  return {
    analysis: {
      fileName,
      rowCount: readings.length,
      columns: [
        { name: "系列", type: "group", count: readings.length },
        { name: "读图数值", type: "numeric", count: readings.length },
      ],
      stats: [],
      generatedAt: Date.now(),
    },
    claims,
  };
}
