/**
 * 组图：每一格都是已入库的谱，拼成 a/b/c 网格。
 * 不在这里编化学归属，也不把模型粘贴的长谱当数据。
 */

import {
  isPeakStackKind,
  parseGuideMarks,
  parsePeakMarks,
  parseSourceFileNames,
  type GuideMark,
  type PeakMark,
  type PeakStackKind,
} from "@/lib/agent/peak-stack-series";

export const PANEL_GRID_MAX = 6;

export interface PanelRequest {
  sourceFileNames: string[];
  kind: PeakStackKind;
  title: string;
  xLabel?: string;
  yLabel?: string;
  xMin?: number;
  xMax?: number;
  peaks: PeakMark[];
  guides: GuideMark[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNumber(raw: unknown): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

function namesOf(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item).trim()).filter(Boolean).slice(0, 12);
  }
  return parseSourceFileNames(String(raw ?? ""));
}

function marksOf(raw: unknown, kind: "peaks" | "guides"): { peaks: PeakMark[]; guides: GuideMark[] } | { error: string } {
  const text = typeof raw === "string" ? raw : raw == null ? "" : JSON.stringify(raw);
  if (kind === "peaks") {
    const parsed = parsePeakMarks(text);
    if ("error" in parsed) return parsed;
    return { peaks: parsed.peaks, guides: [] };
  }
  const parsed = parseGuideMarks(text);
  if ("error" in parsed) return parsed;
  return { peaks: [], guides: parsed.guides };
}

function onePanel(raw: unknown, index: number): PanelRequest | { error: string } {
  if (!isRecord(raw)) return { error: `第 ${index + 1} 格不是对象` };
  const kind = String(raw.kind ?? "").trim().toLowerCase();
  if (!isPeakStackKind(kind)) {
    return { error: `第 ${index + 1} 格的 kind 只能是 xrd、ir、raman 或 xps` };
  }
  const sourceFileNames = namesOf(raw.sourceFileNames ?? raw.fileName ?? raw.fileNames);
  if (sourceFileNames.length === 0) {
    return { error: `第 ${index + 1} 格缺少已入库的文件名` };
  }
  const peaks = marksOf(raw.peaks ?? raw.peaksJson, "peaks");
  if ("error" in peaks) return { error: `第 ${index + 1} 格：${peaks.error}` };
  const guides = marksOf(raw.guides ?? raw.guidesJson, "guides");
  if ("error" in guides) return { error: `第 ${index + 1} 格：${guides.error}` };
  const xMin = asNumber(raw.xMin);
  const xMax = asNumber(raw.xMax);
  return {
    sourceFileNames,
    kind,
    title: String(raw.title ?? "").trim(),
    ...(String(raw.xLabel ?? raw.x_label ?? "").trim()
      ? { xLabel: String(raw.xLabel ?? raw.x_label).trim() }
      : {}),
    ...(String(raw.yLabel ?? raw.y_label ?? "").trim()
      ? { yLabel: String(raw.yLabel ?? raw.y_label).trim() }
      : {}),
    ...(xMin != null ? { xMin } : {}),
    ...(xMax != null ? { xMax } : {}),
    peaks: peaks.peaks,
    guides: guides.guides,
  };
}

export function parsePanelGrid(raw: string): { panels: PanelRequest[]; cols?: 1 | 2 | 3 } | { error: string } {
  const text = raw.trim();
  if (!text) return { error: "panelsJson 为空" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "panelsJson 不是合法 JSON" };
  }
  const colsRaw = isRecord(parsed) ? parsed.cols : undefined;
  const list = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.panels)
      ? parsed.panels
      : null;
  if (!list) return { error: "panelsJson 必须是面板数组，或 { panels, cols }" };
  if (list.length < 2) return { error: "组图至少 2 格。单张谱用 plot_peak_stack" };
  if (list.length > PANEL_GRID_MAX) return { error: `组图最多 ${PANEL_GRID_MAX} 格` };
  const panels: PanelRequest[] = [];
  for (let i = 0; i < list.length; i++) {
    const panel = onePanel(list[i], i);
    if ("error" in panel) return panel;
    panels.push(panel);
  }
  const colsNum = Number(colsRaw);
  const cols = colsNum === 1 || colsNum === 2 || colsNum === 3 ? colsNum as 1 | 2 | 3 : undefined;
  return { panels, ...(cols ? { cols } : {}) };
}
