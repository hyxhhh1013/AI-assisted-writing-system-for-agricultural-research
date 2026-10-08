import type { ChartConfig, DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";

/**
 * 把一个表格文件拆成多块可核对的数据。
 * 常见实验表：多个工作表，或同一表里用空行隔开的几张表，或中间空两列的并排表。
 * 只产出定位与预览，不写项目。
 */

export interface SheetGrid {
  sheetName: string;
  grid: string[][];
}

export interface TableBlockLocator {
  sheetName: string;
  headerRow: number;
  dataStart: number;
  dataEnd: number;
  colStart: number;
  colEnd: number;
  /** 整段都是数字、没有表头。切行时把 headerRow 当成第一行数据。 */
  headerless?: boolean;
  /** 助手点名的列（0 起）。有则只取这些列，不再按连续区间切。 */
  columns?: number[];
}

export interface TableBlock {
  kind: "table";
  id: string;
  fileName: string;
  sheetName: string;
  label: string;
  /** 写入 dataSources 的文件名。单块文件保持原名，多块加「 · 标签」以免互相覆盖。 */
  sourceFileName: string;
  headers: string[];
  rowCount: number;
  preview: string[][];
  locator: TableBlockLocator;
}

const MAX_BLOCKS = 24;
const PREVIEW_ROWS = 3;
const PREVIEW_COLS = 6;
const CELL_PREVIEW = 40;

function cellText(value: unknown): string {
  let text = String(value ?? "");
  text = text.replace(/_x([0-9A-Fa-f]{4})_/g, (_match, hex: string) => {
    const code = Number.parseInt(hex, 16);
    if (!Number.isFinite(code) || code < 32 || code === 127) return "";
    return String.fromCharCode(code);
  });
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFEFF]/g, "");
  return text.replace(/\s+/g, " ").trim();
}

function isBlankRow(row: string[]): boolean {
  return row.every((c) => c.trim() === "");
}

/** 保留空行，供「空行隔开的多张表」切分。 */
export function parseGridKeepingBlanks(text: string, delimiter: string): string[][] {
  const clean = text.replace(/^\uFEFF/, "");
  const lines = clean.split(/\r?\n/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
  return lines.map((line) => parseDelimitedLine(line, delimiter));
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function padGrid(grid: string[][]): string[][] {
  const width = grid.reduce((m, row) => Math.max(m, row.length), 0);
  return grid.map((row) => {
    const next = row.map((c) => cellText(c));
    while (next.length < width) next.push("");
    return next;
  });
}

function isNumericCell(value: string): boolean {
  return value !== "" && !Number.isNaN(Number(value));
}

interface HeaderGroup {
  start: number;
  end: number;
}

/** 表头中间空两列及以上视为并排的另一张表；单格空洞（合并单元格）不切开。 */
export function headerGroups(header: string[]): HeaderGroup[] {
  const groups: HeaderGroup[] = [];
  const n = header.length;
  let i = 0;
  while (i < n) {
    while (i < n && header[i].trim() === "") i += 1;
    if (i >= n) break;
    let end = i + 1;
    while (end < n) {
      if (header[end].trim() !== "") {
        end += 1;
        continue;
      }
      let k = end;
      while (k < n && header[k].trim() === "") k += 1;
      if (k >= n || k - end >= 2) break;
      end = k;
    }
    groups.push({ start: i, end });
    i = end;
  }
  return groups;
}

function clip(value: string): string {
  return value.length > CELL_PREVIEW ? `${value.slice(0, CELL_PREVIEW)}…` : value;
}

interface RawRegion {
  start: number;
  end: number;
}

function regionsOf(grid: string[][]): RawRegion[] {
  const regions: RawRegion[] = [];
  let r = 0;
  while (r < grid.length) {
    while (r < grid.length && isBlankRow(grid[r])) r += 1;
    if (r >= grid.length) break;
    const start = r;
    while (r < grid.length && !isBlankRow(grid[r])) r += 1;
    if (r - start >= 2) regions.push({ start, end: r });
  }
  return regions;
}

function rowMostlyNumeric(row: string[]): boolean {
  const values = row.map((c) => c.trim()).filter(Boolean);
  if (values.length === 0) return false;
  const nums = values.filter((v) => isNumericCell(v)).length;
  return nums >= 1 && nums / values.length >= 0.5;
}

/** 表头必须紧挨着数字行。上面的谱名、仪器参数行不会被当成表头。 */
function findHeaderRow(grid: string[][], start: number, end: number): number {
  let best = -1;
  let bestScore = 0;
  for (let r = start; r < end - 1; r++) {
    const labels = (grid[r] ?? []).map((c) => c.trim()).filter((c) => c && !isNumericCell(c));
    if (labels.length === 0) continue;
    let cursor = r + 1;
    while (cursor < end && isBlankRow(grid[cursor] ?? [])) cursor += 1;
    if (cursor >= end || !rowMostlyNumeric(grid[cursor] ?? [])) continue;
    let score = 0;
    for (let i = cursor; i < end; i++) {
      if (rowMostlyNumeric(grid[i] ?? [])) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = r;
    }
  }
  return bestScore >= 1 ? best : -1;
}

function numericRowShare(grid: string[][], start: number, end: number): number {
  let rows = 0;
  let numeric = 0;
  for (let r = start; r < end; r++) {
    if (isBlankRow(grid[r] ?? [])) continue;
    rows += 1;
    if (rowMostlyNumeric(grid[r] ?? [])) numeric += 1;
  }
  return rows === 0 ? 0 : numeric / rows;
}

function isNoiseLabel(value: string): boolean {
  return value.includes("\\") || value.includes("://") || value.length > 80;
}

function bannerLabel(grid: string[][], start: number, headerRow: number): string {
  for (let r = start; r < headerRow; r++) {
    const values = (grid[r] ?? [])
      .map((c) => c.trim())
      .filter((c) => c && !isNumericCell(c) && !isNoiseLabel(c));
    if (values.length === 1 && values[0].length <= 60) return values[0];
  }
  return "";
}

function columnNames(header: string[], banner: string[]): string[] {
  const counts = new Map<string, number>();
  for (const cell of header) {
    const name = cell.trim();
    if (!name) continue;
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return header.map((cell, i) => {
    const name = cell.trim();
    const above = banner[i]?.trim() ?? "";
    if (!name) return above;
    if ((counts.get(name) ?? 0) > 1 && above && !isNumericCell(above)) return above;
    return name;
  });
}

function compactColumns(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  const keep = headers.map((header, i) => header.trim() !== "" || rows.some((row) => (row[i] ?? "").trim() !== ""));
  if (keep.every(Boolean)) return { headers, rows };
  return {
    headers: headers.filter((_, i) => keep[i]),
    rows: rows.map((row) => row.filter((_, i) => keep[i])),
  };
}

function looksLikeKeyValue(headers: string[], rows: string[][]): boolean {
  if (headers.length > 3 || rows.length > 15) return false;
  const longKeys = rows.filter((row) => (row[0] ?? "").trim().length > 12).length;
  return longKeys >= Math.max(1, Math.ceil(rows.length / 2));
}

/** 仪器参数这类键值说明没有成列的数字，不进确认卡。 */
export function isTabularData(headers: string[], rows: string[][]): boolean {
  if (headers.length === 0 || rows.length === 0) return false;
  if (!headers.some((h) => h.trim())) return false;
  if (looksLikeKeyValue(headers, rows)) return false;
  const minNums = rows.length <= 8 ? 1 : 5;
  for (let c = 0; c < headers.length; c++) {
    const values = rows.map((row) => (row[c] ?? "").trim()).filter(Boolean);
    if (values.length === 0) continue;
    const nums = values.filter((v) => isNumericCell(v)).length;
    if (nums >= minNums && nums / values.length >= 0.7) return true;
  }
  return false;
}

/** 长数字矩阵（谱、曲线）不能收成均值或「随序号上升」。 */
export function isCurveTable(headers: string[], rows: string[][]): boolean {
  if (rows.length < 20 || headers.length < 2) return false;
  const used = headers.map((_, i) => i).filter((i) => headers[i].trim() || rows.some((row) => (row[i] ?? "").trim()));
  if (used.length < 2) return false;
  return used.every((i) => {
    const values = rows.map((row) => (row[i] ?? "").trim()).filter(Boolean);
    if (values.length === 0) return true;
    return values.filter((v) => isNumericCell(v)).length / values.length >= 0.9;
  });
}

function sheetLabelOf(sheetName: string, fileName: string): string {
  if (sheetName !== "CSV") return sheetName;
  return fileName.replace(/\.[^.]+$/, "") || fileName;
}

function pushSliced(
  blocks: Omit<TableBlock, "id" | "sourceFileName">[],
  grid: string[][],
  locator: TableBlockLocator,
  label: string,
  fileName: string,
  sheetName: string,
) {
  const sliced = sliceTableBlock(grid, locator);
  if (!isTabularData(sliced.headers, sliced.rows)) return;
  blocks.push({
    kind: "table",
    fileName,
    sheetName,
    label: label.slice(0, 40),
    headers: sliced.headers,
    rowCount: sliced.rows.length,
    preview: sliced.rows.slice(0, PREVIEW_ROWS).map((row) => row.slice(0, PREVIEW_COLS).map((c) => clip(c ?? ""))),
    locator,
  });
}

export function splitSheetGrid(gridIn: string[][], sheetName: string, fileName: string): Omit<TableBlock, "id" | "sourceFileName">[] {
  const grid = padGrid(gridIn);
  const blocks: Omit<TableBlock, "id" | "sourceFileName">[] = [];
  const sheetLabel = sheetLabelOf(sheetName, fileName);
  for (const region of regionsOf(grid)) {
    const headerIdx = findHeaderRow(grid, region.start, region.end);
    if (headerIdx < 0) {
      if (numericRowShare(grid, region.start, region.end) < 0.85) continue;
      let colStart = -1;
      let colEnd = -1;
      for (let r = region.start; r < region.end; r++) {
        const row = grid[r] ?? [];
        for (let c = 0; c < row.length; c++) {
          if (!row[c]?.trim()) continue;
          if (colStart < 0 || c < colStart) colStart = c;
          if (c + 1 > colEnd) colEnd = c + 1;
        }
      }
      if (colStart < 0 || colEnd - colStart < 2) continue;
      pushSliced(blocks, grid, {
        sheetName,
        headerRow: region.start,
        dataStart: region.start,
        dataEnd: region.end,
        colStart,
        colEnd,
        headerless: true,
      }, sheetLabel, fileName, sheetName);
      continue;
    }
    const header = grid[headerIdx] ?? [];
    const bannerRow = headerIdx > 0 ? (grid[headerIdx - 1] ?? []) : [];
    const groups = headerGroups(header);
    const banner = bannerLabel(grid, region.start, headerIdx);
    groups.forEach((group, groupIdx) => {
      const names = columnNames(header.slice(group.start, group.end), bannerRow.slice(group.start, group.end));
      const headLabel = names.filter(Boolean).slice(0, 3).join("、");
      let label = banner || headLabel || sheetLabel;
      if (!banner && sheetName !== "CSV") {
        label = headLabel && headLabel.length <= 28 && !headLabel.startsWith(sheetName)
          ? `${sheetName} · ${headLabel}`
          : sheetName;
      }
      if (groups.length > 1) {
        label = banner
          ? `${banner} · ${headLabel || `表${groupIdx + 1}`}`
          : (headLabel || `${sheetLabel} · 表${groupIdx + 1}`);
      }
      pushSliced(blocks, grid, {
        sheetName,
        headerRow: headerIdx,
        dataStart: headerIdx + 1,
        dataEnd: region.end,
        colStart: group.start,
        colEnd: group.end,
      }, label, fileName, sheetName);
    });
  }
  return blocks;
}

export function inventorySheetGrids(sheets: SheetGrid[], fileName: string): TableBlock[] {
  const raw: Omit<TableBlock, "id" | "sourceFileName">[] = [];
  for (const sheet of sheets) {
    raw.push(...splitSheetGrid(sheet.grid, sheet.sheetName, fileName));
    if (raw.length >= MAX_BLOCKS) break;
  }
  const capped = raw.slice(0, MAX_BLOCKS);
  const names = sourceFileNames(fileName, capped.map((b) => b.label));
  return capped.map((block, i) => ({
    ...block,
    id: `b${i}`,
    sourceFileName: names[i] ?? fileName,
  }));
}

export function sourceFileNames(fileName: string, labels: string[]): string[] {
  if (labels.length <= 1) return labels.length === 1 ? [fileName] : [];
  const used = new Set<string>();
  return labels.map((label, i) => {
    const safe = (label || `数据块${i + 1}`).replace(/[\\/]/g, " ").trim();
    let name = `${fileName} · ${safe}`.slice(0, 180);
    if (used.has(name)) name = `${name} #${i + 1}`.slice(0, 180);
    used.add(name);
    return name;
  });
}

export interface AgentTablePick {
  label: string;
  note: string;
  sheet: string;
  /** 预览里的行号，从 1 起。headerless 时可空。 */
  headerRow: number | null;
  /** 预览里的列号，从 1 起。 */
  columns: number[];
  headerless: boolean;
}

export function parseAgentTablePicks(raw: unknown): { ok: true; items: AgentTablePick[] } | { ok: false; error: string } {
  let value = raw;
  if (typeof raw === "string") {
    const text = raw.trim();
    if (!text) return { ok: true, items: [] };
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      return { ok: false, error: "tablesJson 不是合法 JSON" };
    }
  }
  if (value == null) return { ok: true, items: [] };
  if (!Array.isArray(value)) return { ok: false, error: "tablesJson 必须是数组" };
  if (value.length > 8) return { ok: false, error: "一次最多说明 8 块数据" };
  const items: AgentTablePick[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") return { ok: false, error: "tablesJson 里有无法识别的项" };
    const rec = entry as Record<string, unknown>;
    const columns = Array.isArray(rec.columns)
      ? rec.columns.map((n) => Number(n)).filter((n) => Number.isInteger(n) && n >= 1)
      : [];
    if (columns.length === 0) return { ok: false, error: "每一块都要有 columns（从 1 起的列号）" };
    const headerRowRaw = Number(rec.headerRow);
    items.push({
      label: String(rec.label ?? "").trim() || "数据",
      note: String(rec.note ?? rec.meaning ?? "").trim(),
      sheet: String(rec.sheet ?? rec.sheetName ?? "").trim(),
      headerRow: Number.isInteger(headerRowRaw) && headerRowRaw >= 1 ? headerRowRaw : null,
      columns,
      headerless: rec.headerless === true,
    });
  }
  return { ok: true, items };
}

/** 按助手给出的行号、列号从原表切一块，不另套表头规则。 */
export function blockFromAgentPick(
  sheets: SheetGrid[],
  fileName: string,
  pick: AgentTablePick,
): { ok: true; block: Omit<TableBlock, "id" | "sourceFileName">; note: string } | { ok: false; error: string } {
  const sheet = sheets.find((item) => item.sheetName === pick.sheet) ?? (pick.sheet ? undefined : sheets[0]);
  if (!sheet) return { ok: false, error: `没有工作表「${pick.sheet || "（空）"}」` };
  const grid = padGrid(sheet.grid);
  if (grid.length === 0) return { ok: false, error: `「${sheet.sheetName}」是空表` };
  const columns = pick.columns.map((n) => n - 1);
  if (columns.length === 0) return { ok: false, error: "columns 至少要有一列" };
  if (columns.some((c) => c < 0 || c >= (grid[0]?.length ?? 0))) {
    return { ok: false, error: `列号超出「${sheet.sheetName}」的范围` };
  }
  const headerIndex = pick.headerless
    ? Math.max((pick.headerRow ?? 1) - 1, 0)
    : (pick.headerRow ?? 0) - 1;
  if (!pick.headerless && (pick.headerRow == null || headerIndex < 0 || headerIndex >= grid.length)) {
    return { ok: false, error: "headerRow 必须是预览里的表头行号（从 1 起）" };
  }
  const dataStart = pick.headerless ? headerIndex : headerIndex + 1;
  const locator: TableBlockLocator = {
    sheetName: sheet.sheetName,
    headerRow: pick.headerless ? dataStart : headerIndex,
    dataStart,
    dataEnd: grid.length,
    colStart: Math.min(...columns),
    colEnd: Math.max(...columns) + 1,
    headerless: pick.headerless || undefined,
    columns,
  };
  const sliced = sliceTableBlock(grid, locator);
  if (sliced.rows.length === 0) return { ok: false, error: `「${pick.label}」按这个行列没有数据` };
  const label = (pick.label || sheet.sheetName).slice(0, 40);
  return {
    ok: true,
    note: pick.note,
    block: {
      kind: "table",
      fileName,
      sheetName: sheet.sheetName,
      label,
      headers: sliced.headers,
      rowCount: sliced.rows.length,
      preview: sliced.rows.slice(0, PREVIEW_ROWS).map((row) => row.slice(0, PREVIEW_COLS).map((c) => clip(c ?? ""))),
      locator,
    },
  };
}

/** 带行号、列号的原文，给助手点选，不判断哪一块才是数据。 */
export function formatGridPreview(gridIn: string[][], sheetName: string): string {
  const grid = padGrid(gridIn);
  const nonempty: number[] = [];
  for (let r = 0; r < grid.length; r++) {
    if (!isBlankRow(grid[r] ?? [])) nonempty.push(r);
  }
  const show = new Set<number>();
  for (const r of nonempty.slice(0, 24)) show.add(r);
  for (const r of nonempty.slice(-2)) show.add(r);
  const lines = [`## ${sheetName}（${grid.length} 行）`];
  let prev = -1;
  for (const r of [...show].sort((a, b) => a - b)) {
    if (prev >= 0 && r > prev + 1) lines.push("…");
    const cells = (grid[r] ?? [])
      .map((cell, i) => (cell.trim() ? `列${i + 1}=${clip(cell.trim())}` : ""))
      .filter(Boolean);
    lines.push(`行${r + 1} ${cells.join(" | ") || "(空)"}`);
    prev = r;
  }
  if (nonempty.length > 26) lines.push(`（有内容 ${nonempty.length} 行，中间已省略）`);
  return lines.join("\n");
}

export function sliceTableBlock(
  grid: string[][],
  locator: TableBlockLocator,
): { headers: string[]; rows: string[][] } {
  const padded = padGrid(grid);
  if (locator.columns && locator.columns.length > 0) {
    const columns = locator.columns;
    const rows: string[][] = [];
    for (let r = locator.dataStart; r < locator.dataEnd; r++) {
      const src = padded[r] ?? [];
      const slice = columns.map((c) => (src[c] ?? "").trim());
      if (slice.some((c) => c)) rows.push(slice);
    }
    const headers = locator.headerless
      ? columns.map((_, i) => (columns.length === 2 ? (i === 0 ? "x" : "y") : `列${i + 1}`))
      : columns.map((c, i) => (padded[locator.headerRow]?.[c] ?? "").trim() || `列${i + 1}`);
    return { headers, rows };
  }
  const width = Math.max(0, locator.colEnd - locator.colStart);
  const rows: string[][] = [];
  for (let r = locator.dataStart; r < locator.dataEnd; r++) {
    const src = padded[r] ?? [];
    const slice = Array.from({ length: width }, (_, i) => (src[locator.colStart + i] ?? "").trim());
    if (slice.some((c) => c)) rows.push(slice);
  }
  if (locator.headerless) {
    const headers = Array.from({ length: width }, (_, i) => (width === 2 ? (i === 0 ? "x" : "y") : `列${i + 1}`));
    return compactColumns(headers, rows);
  }
  const headerRow = padded[locator.headerRow] ?? [];
  const banner = locator.headerRow > 0 ? (padded[locator.headerRow - 1] ?? []) : [];
  const headers = columnNames(
    headerRow.slice(locator.colStart, locator.colEnd),
    banner.slice(locator.colStart, locator.colEnd),
  );
  return compactColumns(headers, rows);
}

export function curveLineChart(headers: string[], rows: string[][], title: string): ChartConfig | null {
  if (!isCurveTable(headers, rows)) return null;
  const labels = rows.map((row) => row[0] ?? "");
  const datasets = headers.slice(1).map((name, index) => ({
    label: name.trim() || `y${index + 1}`,
    data: rows.map((row) => {
      const n = Number(row[index + 1]);
      return Number.isFinite(n) ? n : 0;
    }),
  }));
  if (datasets.length === 0) return null;
  return {
    type: "line",
    title: title.slice(0, 80),
    xLabel: headers[0] || "x",
    yLabel: datasets.length === 1 ? datasets[0].label : headers[1] || "y",
    labels,
    datasets,
  };
}

/** 谱和图上的长曲线只保留可画的折线，不生成均值、趋势、相关声明。 */
export function withoutCurveStatistics<T extends { claims: EvidenceClaim[]; analysis: DataSourceAnalysis }>(
  parsed: T,
  headers: string[],
  rows: string[][],
  title: string,
): T {
  const chart = curveLineChart(headers, rows, title);
  if (!chart) return parsed;
  return {
    ...parsed,
    claims: [],
    analysis: { ...parsed.analysis, chartConfigs: [chart] },
  };
}

export function blockToCsv(headers: string[], rows: string[][]): string {
  const esc = (value: string) => {
    if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
    return value;
  };
  return [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

export function decodeTabularText(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return new TextDecoder("utf-8").decode(bytes);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("gbk").decode(bytes);
  }
}

export async function gridsFromXlsx(buffer: ArrayBuffer): Promise<SheetGrid[]> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(buffer, { type: "array" });
  return wb.SheetNames.map((sheetName) => {
    const data = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName], {
      header: 1,
      defval: "",
      blankrows: true,
    });
    const grid = data.map((row) => (Array.isArray(row) ? row.map((c) => cellText(c)) : []));
    while (grid.length > 0 && isBlankRow(grid[grid.length - 1])) grid.pop();
    return { sheetName, grid };
  });
}

export async function loadTabularGrids(input: string | ArrayBuffer, fileName: string): Promise<SheetGrid[]> {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "xlsx" || ext === "xls") {
    const buf = typeof input === "string"
      ? new TextEncoder().encode(input).buffer
      : input;
    return gridsFromXlsx(buf);
  }
  const text = typeof input === "string" ? input : decodeTabularText(input);
  if (ext === "dpt" || ext === "xy") {
    const grid = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim()).map((line) => line.trim().split(/\s+/));
    return [{ sheetName: ext.toUpperCase(), grid }];
  }
  const delimiter = ext === "tsv" || ext === "tab" || (text.includes("\t") && !text.includes(","))
    ? "\t"
    : ",";
  return [{ sheetName: "CSV", grid: parseGridKeepingBlanks(text, delimiter) }];
}
