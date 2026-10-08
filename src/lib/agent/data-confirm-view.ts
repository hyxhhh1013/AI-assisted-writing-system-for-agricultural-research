/**
 * 数据确认卡的纯展示类型。不含数据库或文件系统，供确认页直接引用。
 */

import type { TableBlockLocator } from "@/lib/data-block-inventory";
import {
  parseFigureReadingList,
  type FigureReading,
} from "@/lib/agent/figure-reading-parse";

export type { FigureReading };

export interface DataConfirmItem {
  index: number;
  kind: "table" | "figure";
  label: string;
  fileName: string;
  sourceFileName?: string;
  sheetName?: string;
  rowCount?: number;
  headers?: string[];
  preview?: string[][];
  attachmentId?: string;
  locator?: TableBlockLocator;
  /** 从图上读出、待用户核对的数值 */
  readings?: FigureReading[];
  readingNote?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseLocator(raw: unknown): TableBlockLocator | null {
  if (!isRecord(raw)) return null;
  const nums = ["headerRow", "dataStart", "dataEnd", "colStart", "colEnd"] as const;
  const loc: Record<string, number> = {};
  for (const key of nums) {
    const n = Number(raw[key]);
    if (!Number.isInteger(n) || n < 0) return null;
    loc[key] = n;
  }
  const sheetName = String(raw.sheetName ?? "").trim();
  if (!sheetName) return null;
  return {
    sheetName,
    headerRow: loc.headerRow,
    dataStart: loc.dataStart,
    dataEnd: loc.dataEnd,
    colStart: loc.colStart,
    colEnd: loc.colEnd,
    headerless: raw.headerless === true ? true : undefined,
    columns: parseColumns(raw.columns),
  };
}

function parseColumns(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const columns = raw.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 0);
  return columns.length > 0 ? columns : undefined;
}

export function parseDataConfirmItems(raw: unknown): DataConfirmItem[] {
  if (!Array.isArray(raw)) return [];
  const out: DataConfirmItem[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const kind = item.kind === "figure" ? "figure" : item.kind === "table" ? "table" : null;
    if (!kind) continue;
    const label = String(item.label ?? "").trim();
    const fileName = String(item.fileName ?? "").trim();
    if (!label || !fileName) continue;
    const locator = parseLocator(item.locator);
    out.push({
      index: out.length,
      kind,
      label,
      fileName,
      sourceFileName: typeof item.sourceFileName === "string" ? item.sourceFileName : undefined,
      sheetName: typeof item.sheetName === "string" ? item.sheetName : undefined,
      rowCount: Number.isFinite(Number(item.rowCount)) ? Number(item.rowCount) : undefined,
      headers: Array.isArray(item.headers) ? item.headers.map((h) => String(h ?? "")) : undefined,
      preview: Array.isArray(item.preview)
        ? item.preview
          .filter((row) => Array.isArray(row))
          .map((row) => (row as unknown[]).map((c) => String(c ?? "")))
        : undefined,
      attachmentId: typeof item.attachmentId === "string" ? item.attachmentId : undefined,
      locator: locator ?? undefined,
      readings: parseFigureReadingList(item.readings),
      readingNote: typeof item.readingNote === "string" ? item.readingNote.slice(0, 200) : undefined,
    });
  }
  return out;
}
