import type { DataSourceAnalysis } from "@/contracts/data-source";
import {
  inventorySheetGrids,
  sliceTableBlock,
  type SheetGrid,
} from "@/lib/data-block-inventory";

/** 写入项目的行数。全表仍在原文件里，这里只留一段供点开查看。 */
export const STORED_PREVIEW_ROWS = 40;
export const STORED_PREVIEW_COLS = 8;
/** 点开时从原文件再读的行数。 */
export const DETAIL_PREVIEW_ROWS = 80;
export const DETAIL_PREVIEW_COLS = 12;

const CELL_CHARS = 48;

export type TableMatch = "stored" | "series" | "block" | "columns" | "file-head";

export interface TableSnapshot {
  headers: string[];
  preview: string[][];
  previewTail?: string[][];
  rowCount: number;
  omittedColumns: number;
  sheetName?: string;
  matched: TableMatch;
}

function clipCell(value: string): string {
  return value.replace(/\s+/g, " ").trim().slice(0, CELL_CHARS);
}

function clipRow(row: string[], width: number): string[] {
  return Array.from({ length: width }, (_, i) => clipCell(row[i] ?? ""));
}

export function originalTabularName(fileName: string): string {
  const mark = fileName.indexOf(" · ");
  return (mark === -1 ? fileName : fileName.slice(0, mark)).trim();
}

export function buildTableSnapshot(
  headers: string[],
  rows: string[][],
  opts?: { maxRows?: number; maxCols?: number; sheetName?: string; matched?: TableMatch },
): TableSnapshot {
  const maxRows = opts?.maxRows ?? STORED_PREVIEW_ROWS;
  const maxCols = opts?.maxCols ?? STORED_PREVIEW_COLS;
  const width = Math.min(Math.max(headers.length, 1), maxCols);
  const named = Array.from({ length: width }, (_, i) => headers[i]?.trim() || `列${i + 1}`);
  const preview = rows.slice(0, maxRows).map((row) => clipRow(row, width));
  const previewTail = rows.length > maxRows + 2
    ? rows.slice(-2).map((row) => clipRow(row, width))
    : undefined;
  return {
    headers: named,
    preview,
    previewTail,
    rowCount: rows.length,
    omittedColumns: Math.max(0, headers.length - width),
    sheetName: opts?.sheetName,
    matched: opts?.matched ?? "stored",
  };
}

/** 把快照写进分析结果，点开时不必再找原文件。 */
export function withStoredPreview(
  analysis: DataSourceAnalysis,
  headers: string[],
  rows: string[][],
  extra?: { sheetName?: string; note?: string; attachmentId?: string },
): DataSourceAnalysis {
  const snap = buildTableSnapshot(headers, rows, { sheetName: extra?.sheetName, matched: "stored" });
  return {
    ...analysis,
    preview: snap.preview,
    previewTail: snap.previewTail,
    previewHeaders: snap.headers,
    sheetName: extra?.sheetName || analysis.sheetName,
    note: extra?.note || analysis.note,
    attachmentId: extra?.attachmentId || analysis.attachmentId,
  };
}

function snapshotFromLineChart(source: DataSourceAnalysis): TableSnapshot | null {
  const chart = source.chartConfigs?.find((item) => item.type === "line" && item.labels.length >= 20);
  if (!chart) return null;
  if (source.rowCount > 0 && chart.labels.length < source.rowCount * 0.5) return null;
  const headers = [chart.xLabel || "x", ...chart.datasets.map((d) => d.label || "y")];
  const rows = chart.labels.map((label, i) => [
    label,
    ...chart.datasets.map((d) => {
      const n = d.data[i];
      return n == null || Number.isNaN(n) ? "" : String(n);
    }),
  ]);
  return buildTableSnapshot(headers, rows, {
    maxRows: DETAIL_PREVIEW_ROWS,
    maxCols: DETAIL_PREVIEW_COLS,
    matched: "series",
  });
}

/** 已在项目 JSON 里的行。没有则返回 null，再去原文件找。 */
export function storedTableDetail(source: DataSourceAnalysis): TableSnapshot | null {
  if (source.preview && source.preview.length > 0) {
    const headers = (source.previewHeaders?.length
      ? source.previewHeaders
      : source.columns.map((c) => c.name)
    ).slice(0, source.preview[0]?.length || source.previewHeaders?.length || 1);
    return {
      headers: headers.map((h, i) => h.trim() || `列${i + 1}`),
      preview: source.preview,
      previewTail: source.previewTail,
      rowCount: source.rowCount,
      omittedColumns: Math.max(0, source.columns.length - headers.length),
      sheetName: source.sheetName,
      matched: "stored",
    };
  }
  return snapshotFromLineChart(source);
}

function usableColumnNames(names: string[]): string[] {
  return names
    .map((name) => name.trim())
    .filter((name) => name.length >= 2 && !/^列\d+$/.test(name) && name !== "x" && name !== "y");
}

function rowScore(row: string[], names: string[]): number {
  const cells = new Set(row.map((cell) => cell.trim()).filter(Boolean));
  return names.filter((name) => cells.has(name)).length;
}

function snapshotFromRegion(
  headers: string[],
  rows: string[][],
  sheetName: string,
  matched: TableMatch,
): TableSnapshot | null {
  if (headers.length === 0 || rows.length === 0) return null;
  return buildTableSnapshot(headers, rows, {
    maxRows: DETAIL_PREVIEW_ROWS,
    maxCols: DETAIL_PREVIEW_COLS,
    sheetName,
    matched,
  });
}

function matchByColumns(grids: SheetGrid[], names: string[]): TableSnapshot | null {
  if (names.length === 0) return null;
  const need = Math.min(2, names.length);
  let best: { score: number; sheet: SheetGrid; row: number } | null = null;
  for (const sheet of grids) {
    for (let r = 0; r < sheet.grid.length; r++) {
      const score = rowScore(sheet.grid[r] ?? [], names);
      if (score < need) continue;
      if (!best || score > best.score) best = { score, sheet, row: r };
    }
  }
  if (!best) return null;
  const header = best.sheet.grid[best.row] ?? [];
  const indexes = header
    .map((cell, i) => ({ cell: cell.trim(), i }))
    .filter((item) => item.cell)
    .slice(0, DETAIL_PREVIEW_COLS);
  if (indexes.length === 0) return null;
  const headers = indexes.map((item) => item.cell);
  const rows: string[][] = [];
  let blanks = 0;
  for (let r = best.row + 1; r < best.sheet.grid.length && rows.length < 400; r++) {
    const src = best.sheet.grid[r] ?? [];
    const slice = indexes.map((item) => (src[item.i] ?? "").trim());
    if (slice.every((cell) => !cell)) {
      blanks += 1;
      if (blanks >= 2) break;
      continue;
    }
    blanks = 0;
    rows.push(slice);
  }
  return snapshotFromRegion(headers, rows, best.sheet.sheetName, "columns");
}

function fileHead(grids: SheetGrid[]): TableSnapshot | null {
  const sheet = grids.find((item) => item.grid.some((row) => row.some((cell) => cell.trim())));
  if (!sheet) return null;
  const nonempty = sheet.grid.filter((row) => row.some((cell) => cell.trim()));
  if (nonempty.length === 0) return null;
  const width = Math.min(
    DETAIL_PREVIEW_COLS,
    Math.max(...nonempty.slice(0, 8).map((row) => row.length), 1),
  );
  const first = nonempty[0] ?? [];
  const numeric = first.filter((cell) => cell.trim()).filter((cell) => /^-?\d+(\.\d+)?$/.test(cell.trim())).length;
  const labeled = numeric < Math.max(1, first.filter((cell) => cell.trim()).length) / 2;
  const headers = labeled
    ? Array.from({ length: width }, (_, i) => first[i]?.trim() || `列${i + 1}`)
    : Array.from({ length: width }, (_, i) => `列${i + 1}`);
  const body = (labeled ? nonempty.slice(1) : nonempty).map((row) => row.slice(0, width));
  return snapshotFromRegion(headers, body, sheet.sheetName, "file-head");
}

/**
 * 用已入库的文件名，从原表网格里找回这一块。
 * 先按入库名对切块，再按列名对表头，对不上就给出文件开头。
 */
export function previewFromGrids(
  grids: SheetGrid[],
  storedFileName: string,
  columnNames: string[],
): TableSnapshot | null {
  const original = originalTabularName(storedFileName);
  const blocks = inventorySheetGrids(grids, original);
  const block = blocks.find((item) => item.sourceFileName === storedFileName);
  if (block) {
    const sheet = grids.find((item) => item.sheetName === block.locator.sheetName) ?? grids[0];
    if (sheet) {
      const sliced = sliceTableBlock(sheet.grid, block.locator);
      const snap = snapshotFromRegion(sliced.headers, sliced.rows, block.sheetName, "block");
      if (snap) return snap;
    }
  }
  return matchByColumns(grids, usableColumnNames(columnNames)) ?? fileHead(grids);
}
