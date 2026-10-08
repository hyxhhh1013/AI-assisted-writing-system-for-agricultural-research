/**
 * 实验数据入库前的核对清单。
 * 确认卡勾选之后才写入 dataSources / 图表库。已有图不产生数值声明。
 */

import { analyzeData } from "@/services/data-analysis";
import type { AgentToolResult } from "@/contracts/agent";
import {
  decodeTabularText,
  blockFromAgentPick,
  inventorySheetGrids,
  loadTabularGrids,
  parseAgentTablePicks,
  sliceTableBlock,
  sourceFileNames,
  withoutCurveStatistics,
  type SheetGrid,
  type TableBlock,
} from "@/lib/data-block-inventory";
import { parseDataConfirmItems, type DataConfirmItem } from "@/lib/agent/data-confirm-view";
import { readAttachmentFile } from "@/lib/agent/attachments/storage";
import { inferAttachmentKind } from "@/lib/agent/attachments/kind";
import { normalizeIngestSourceId, persistIngestedAnalysis } from "@/lib/agent/ingest-project-data";
import { isExistingFigureName, registerExistingFigure } from "@/lib/agent/register-existing-figure";
import { proposeFigureReadings } from "@/lib/agent/figure-readings";
import {
  figureReadingsToEvidence,
  parseFigureReadingList,
  type FigureReading,
} from "@/lib/agent/figure-reading-parse";
import { enrichAnalysisWithPeakTable } from "@/lib/agent/xrd-ingested-peaks";
import { withStoredPreview } from "@/lib/data-table-snapshot";
import type { AgentContext } from "@/lib/agent/types";
import prisma from "@/lib/prisma";

const MAX_CSV_CHARS = 100_000;
const TABULAR_EXTS = new Set(["csv", "tsv", "xlsx", "xls", "dpt", "xy"]);

export type { DataConfirmItem };
export { parseDataConfirmItems };

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function isTabularName(name: string): boolean {
  return TABULAR_EXTS.has(extOf(name));
}

function bufferToArrayBuffer(buf: Buffer): ArrayBuffer {
  const copy = new ArrayBuffer(buf.byteLength);
  new Uint8Array(copy).set(buf);
  return copy;
}

function bufferToInput(buf: Buffer, fileName: string): string | ArrayBuffer {
  const ext = extOf(fileName);
  const bytes = bufferToArrayBuffer(buf);
  if (ext === "xlsx" || ext === "xls") return bytes;
  return decodeTabularText(bytes);
}

function tableItem(block: TableBlock, attachmentId?: string): DataConfirmItem {
  return {
    index: 0,
    kind: "table",
    label: block.label,
    fileName: block.fileName,
    sourceFileName: block.sourceFileName,
    sheetName: block.sheetName,
    rowCount: block.rowCount,
    headers: block.headers,
    preview: block.preview,
    attachmentId,
    locator: block.locator,
  };
}

function figureItem(fileName: string, attachmentId: string, label?: string): DataConfirmItem {
  return {
    index: 0,
    kind: "figure",
    label: (label || fileName).slice(0, 80),
    fileName,
    attachmentId,
  };
}

interface OwnedAttachment {
  id: string;
  originalName: string;
  sessionId: string | null;
  projectId: string | null;
  pinned: boolean;
  userId: string;
}

async function loadOwnedAttachment(
  ctx: AgentContext,
  attachmentId: string,
): Promise<{ ok: true; row: OwnedAttachment } | { ok: false; error: string }> {
  const row = await prisma.agentAttachment.findFirst({
    where: { id: attachmentId, userId: ctx.userId },
  });
  if (!row || row.userId !== ctx.userId) {
    return { ok: false, error: "附件不存在或无权访问" };
  }
  const owned =
    (row.sessionId == null || row.sessionId === ctx.sessionId)
    || (row.pinned && ctx.projectId != null && row.projectId === ctx.projectId);
  if (!owned) return { ok: false, error: "该附件不属于当前会话/项目" };
  return { ok: true, row };
}

async function gridsForAttachment(row: OwnedAttachment): Promise<SheetGrid[]> {
  const buf = readAttachmentFile(row.userId, row.id);
  return loadTabularGrids(bufferToInput(buf, row.originalName), row.originalName);
}

async function sessionFigureItems(
  ctx: AgentContext,
  skipIds: Set<string>,
): Promise<DataConfirmItem[]> {
  if (!ctx.sessionId && !ctx.projectId) return [];
  let rows: Awaited<ReturnType<typeof prisma.agentAttachment.findMany>>;
  try {
    rows = await prisma.agentAttachment.findMany({
    where: {
      userId: ctx.userId,
      status: "ready",
      OR: [
        ...(ctx.sessionId ? [{ sessionId: ctx.sessionId }] : []),
        ...(ctx.projectId ? [{ projectId: ctx.projectId, pinned: true }] : []),
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 40,
  });
  } catch {
    return [];
  }
  const items: DataConfirmItem[] = [];
  for (const row of rows) {
    if (skipIds.has(row.id)) continue;
    if (!isExistingFigureName(row.originalName)) continue;
    if (inferAttachmentKind(row.originalName) !== "image") continue;
    items.push(figureItem(row.originalName, row.id));
    if (items.length >= 12) break;
  }
  return items;
}

function reindex(items: DataConfirmItem[]): DataConfirmItem[] {
  return items.map((item, index) => ({ ...item, index }));
}

/** 确认卡参数：列出表块和同会话已有图，不写库。 */
export async function buildIngestConfirmParams(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<Record<string, unknown>> {
  try {
    const built = await inventoryFromParams(params, ctx);
    if (!built.ok) {
      return { ...params, dataItems: [], inventoryError: built.error };
    }
    return { ...params, dataItems: built.items };
  } catch (err) {
    const message = err instanceof Error ? err.message : "无法列出数据块";
    return { ...params, dataItems: [], inventoryError: message };
  }
}

async function inventoryFromParams(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<{ ok: true; items: DataConfirmItem[] } | { ok: false; error: string }> {
  const attachmentId = String(params.attachmentId ?? params.fileId ?? "").trim();
  const csvData = typeof params.csvData === "string" ? params.csvData : "";
  const pastedName = String(params.fileName ?? "").trim();
  const items: DataConfirmItem[] = [];
  const seenFigures = new Set<string>();

  if (attachmentId) {
    const owned = await loadOwnedAttachment(ctx, attachmentId);
    if (!owned.ok) return owned;
    const name = owned.row.originalName;
    if (isExistingFigureName(name)) {
      items.push(figureItem(name, owned.row.id));
      seenFigures.add(owned.row.id);
    } else if (isTabularName(name)) {
      const picks = parseAgentTablePicks(params.tablesJson);
      if (!picks.ok) return picks;
      if (picks.items.length === 0) {
        return {
          ok: false,
          error: "先 read_attachment 看带行号的原文，再用 tablesJson 说明读法（label、note、sheet、headerRow、columns）。不要套固定表头。用户确认后才写入。",
        };
      }
      const grids = await gridsForAttachment(owned.row);
      const builtBlocks: Array<{ ok: true; block: Omit<TableBlock, "id" | "sourceFileName">; note: string }> = [];
      for (const pick of picks.items) {
        const built = blockFromAgentPick(grids, name, pick);
        if (!built.ok) return built;
        builtBlocks.push(built);
      }
      const names = sourceFileNames(name, builtBlocks.map((built) => built.block.label));
      builtBlocks.forEach((built, i) => {
        const item = tableItem(
          { ...built.block, id: `b${i}`, sourceFileName: names[i] ?? name },
          owned.row.id,
        );
        item.readingNote = built.note || undefined;
        items.push(item);
      });
    } else {
      return { ok: false, error: `「${name}」不是表格或图片。请上传 CSV/Excel，或 png/jpg/tiff 成图。` };
    }
  } else if (csvData.trim() && pastedName) {
    if (!isTabularName(pastedName)) {
      return { ok: false, error: "fileName 须为 csv/tsv/xlsx/xls，例如 yield.csv" };
    }
    if (csvData.length > MAX_CSV_CHARS) {
      return { ok: false, error: `csvData 过长（>${MAX_CSV_CHARS} 字符），请改传附件` };
    }
    const grids = await loadTabularGrids(csvData, pastedName);
    for (const block of inventorySheetGrids(grids, pastedName)) {
      items.push(tableItem(block));
    }
  } else {
    return {
      ok: false,
      error: "请提供 attachmentId（对话框已上传的 CSV/Excel/图片），或同时提供 csvData 与 fileName。",
    };
  }

  items.push(...await sessionFigureItems(ctx, seenFigures));
  return { ok: true, items: reindex(await attachFigureReadings(items, ctx, params)) };
}

const MAX_FIGURES_TO_READ = 4;

function overrideReadings(params: Record<string, unknown>): FigureReading[] {
  const raw = params.readingsJson;
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    return parseFigureReadingList(JSON.parse(raw));
  } catch {
    return [];
  }
}

async function attachFigureReadings(
  items: DataConfirmItem[],
  ctx: AgentContext,
  params: Record<string, unknown>,
): Promise<DataConfirmItem[]> {
  const spoken = overrideReadings(params);
  const targetId = String(params.attachmentId ?? params.fileId ?? "").trim();
  const figureIndexes = items
    .map((item, index) => (item.kind === "figure" && item.attachmentId ? index : -1))
    .filter((index) => index >= 0);
  const next = [...items];
  await Promise.all(figureIndexes.slice(0, MAX_FIGURES_TO_READ).map(async (index) => {
    const item = next[index];
    if (!item?.attachmentId) return;
    if (spoken.length > 0 && (!targetId || item.attachmentId === targetId)) {
      next[index] = {
        ...item,
        readings: spoken,
        readingNote: "这是对话里改过的数值，请再核对一次。",
      };
      return;
    }
    const owned = await loadOwnedAttachment(ctx, item.attachmentId);
    if (!owned.ok) {
      next[index] = { ...item, readingNote: owned.error };
      return;
    }
    try {
      const buf = readAttachmentFile(ctx.userId, owned.row.id);
      const proposed = await proposeFigureReadings(buf, owned.row.originalName);
      next[index] = {
        ...item,
        readings: proposed.points,
        readingNote: proposed.points.length > 0
          ? proposed.note
          : (proposed.note || "没有读出可核对的数值。勾选后只登记图片，写作仍不能使用图中数字。"),
      };
    } catch {
      next[index] = { ...item, readingNote: "图片文件缺失，无法读取数值" };
    }
  }));
  for (const index of figureIndexes.slice(MAX_FIGURES_TO_READ)) {
    const item = next[index];
    if (!item) continue;
    next[index] = {
      ...item,
      readingNote: "这张图尚未读数。请单独确认它，或在对话里报出要写入的数值。",
    };
  }
  return next;
}

function selectedIndexes(raw: unknown, count: number): number[] {
  if (!Array.isArray(raw)) return Array.from({ length: count }, (_, i) => i);
  const out: number[] = [];
  for (const value of raw) {
    const n = Number(value);
    if (Number.isInteger(n) && n >= 0 && n < count && !out.includes(n)) out.push(n);
  }
  return out;
}

export async function commitConfirmedIngest(
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<AgentToolResult> {
  if (!ctx.projectId) {
    return { success: false, error: "ingest_project_data 需要绑定 projectId" };
  }
  if (params.userConfirmed !== true) {
    return {
      success: false,
      error:
        "实验数据须先经确认卡。请发起入库并等用户勾选每一块数据、核对已有图后再写入。未确认不得写结果或出图。",
      data: { requiresConfirmation: true },
    };
  }

  let items = parseDataConfirmItems(params.dataItems);
  if (!Array.isArray(params.dataItems)) {
    const built = await inventoryFromParams(params, ctx);
    if (!built.ok) return { success: false, error: built.error };
    items = built.items;
  } else if (typeof params.inventoryError === "string" && params.inventoryError && items.length === 0) {
    return { success: false, error: params.inventoryError };
  }

  if (items.length === 0) {
    return { success: false, error: "没有识别到可入库的数据块或图片，未写入项目。" };
  }

  const picked = selectedIndexes(params.selectedIndices, items.length);
  if (picked.length === 0) {
    return { success: false, error: "未勾选任何数据块或图片，未写入项目。" };
  }
  const chosen = picked.map((i) => items[i]).filter((item): item is DataConfirmItem => Boolean(item));

  const gridCache = new Map<string, SheetGrid[]>();
  const notes: string[] = [];
  let tableCount = 0;
  let claimCount = 0;
  let figureCount = 0;
  let sourceId: string | undefined;
  const inserted: string[] = [];

  for (const item of chosen) {
    if (item.kind === "table") {
      const saved = await commitTable(item, params, ctx, gridCache);
      if (!saved.ok) return { success: false, error: saved.error };
      tableCount += 1;
      claimCount += saved.claimCount;
      sourceId = saved.sourceId;
      notes.push(`${saved.sourceFileName}（${saved.rowCount} 行，${saved.claimCount} 条声明）`);
      continue;
    }
    const saved = await commitFigure(item, params, ctx);
    if (!saved.ok) return { success: false, error: saved.error };
    figureCount += 1;
    claimCount += saved.claimCount;
    notes.push(
      `图 ${saved.caption} 已登记`
      + (saved.claimCount > 0 ? `，并写入 ${saved.claimCount} 条已核对数值` : "，没有可核对的数值")
      + (saved.insertedSection ? `，已插入 ${saved.insertedSection}` : ""),
    );
    if (saved.insertedSection) inserted.push(saved.insertedSection);
  }

  const summary = [
    tableCount > 0 ? `已按勾选入库 ${tableCount} 块表` : "",
    figureCount > 0 ? `登记已有图 ${figureCount} 张` : "",
    notes.length ? `：${notes.join("；")}` : "",
    "。写入前已由用户确认。下一步可 list_plot_sources，或把已登记图插入指定章节。",
  ].join("");

  return {
    success: true,
    summary,
    data: {
      persisted: true,
      tableCount,
      figureCount,
      claimCount,
      sourceId: tableCount === 1 ? sourceId : undefined,
      insertedSections: inserted,
      confirmed: true,
    },
  };
}

async function gridsForItem(
  item: DataConfirmItem,
  params: Record<string, unknown>,
  ctx: AgentContext,
  cache: Map<string, SheetGrid[]>,
): Promise<{ ok: true; grids: SheetGrid[] } | { ok: false; error: string }> {
  const cacheKey = item.attachmentId || `paste:${item.fileName}`;
  const hit = cache.get(cacheKey);
  if (hit) return { ok: true, grids: hit };

  if (item.attachmentId) {
    const owned = await loadOwnedAttachment(ctx, item.attachmentId);
    if (!owned.ok) return owned;
    try {
      const grids = await gridsForAttachment(owned.row);
      cache.set(cacheKey, grids);
      return { ok: true, grids };
    } catch {
      return { ok: false, error: "附件文件缺失，请重新上传后再入库" };
    }
  }

  const csvData = typeof params.csvData === "string" ? params.csvData : "";
  if (!csvData.trim()) return { ok: false, error: `缺少「${item.fileName}」的表格内容，无法按确认结果切片` };
  const grids = await loadTabularGrids(csvData, item.fileName);
  cache.set(cacheKey, grids);
  return { ok: true, grids };
}

async function commitTable(
  item: DataConfirmItem,
  params: Record<string, unknown>,
  ctx: AgentContext,
  cache: Map<string, SheetGrid[]>,
): Promise<{ ok: true; sourceFileName: string; rowCount: number; claimCount: number; sourceId: string } | { ok: false; error: string }> {
  if (!item.locator) return { ok: false, error: `「${item.label}」缺少表位置，未写入` };
  const loaded = await gridsForItem(item, params, ctx, cache);
  if (!loaded.ok) return loaded;
  const sheet = loaded.grids.find((g) => g.sheetName === item.locator?.sheetName) ?? loaded.grids[0];
  if (!sheet) return { ok: false, error: `「${item.fileName}」没有可读取的工作表` };
  const { headers, rows } = sliceTableBlock(sheet.grid, item.locator);
  if (headers.length === 0 || rows.length === 0) {
    return { ok: false, error: `「${item.label}」没有有效数据行，未写入项目。` };
  }
  const sourceFileName = item.sourceFileName || item.fileName;
  const sourceId = normalizeIngestSourceId(sourceFileName);
  const parsed = withoutCurveStatistics(
    analyzeData(headers, rows, sourceFileName),
    headers,
    rows,
    item.label || sourceFileName,
  );
  const enriched = await enrichAnalysisWithPeakTable(
    parsed.analysis,
    blockCsvBuffer(headers, rows),
    sourceFileName.endsWith(".csv") ? sourceFileName : `${sourceFileName}.csv`,
  );
  const analysis = withStoredPreview(enriched, headers, rows, {
    sheetName: item.sheetName || item.locator.sheetName,
    note: item.readingNote,
    attachmentId: item.attachmentId,
  });
  await persistIngestedAnalysis({
    userId: ctx.userId,
    projectId: ctx.projectId!,
    analysis,
    claims: parsed.claims.map((c) => ({ ...c, sourceId })),
  });
  return {
    ok: true,
    sourceFileName,
    rowCount: analysis.rowCount,
    claimCount: parsed.claims.length,
    sourceId,
  };
}

function blockCsvBuffer(headers: string[], rows: string[][]): string {
  const esc = (value: string) => value;
  return [headers, ...rows].map((row) => row.map(esc).join(",")).join("\n");
}

async function commitFigure(
  item: DataConfirmItem,
  params: Record<string, unknown>,
  ctx: AgentContext,
): Promise<{ ok: true; caption: string; insertedSection?: string; claimCount: number } | { ok: false; error: string }> {
  if (!item.attachmentId) return { ok: false, error: `「${item.label}」没有附件，无法登记成图` };
  const owned = await loadOwnedAttachment(ctx, item.attachmentId);
  if (!owned.ok) return owned;
  if (!isExistingFigureName(owned.row.originalName)) {
    return { ok: false, error: `「${owned.row.originalName}」不是图片，不能当已有图登记` };
  }
  let buf: Buffer;
  try {
    buf = readAttachmentFile(ctx.userId, owned.row.id);
  } catch {
    return { ok: false, error: "图片文件缺失，请重新上传" };
  }
  const sectionKey = typeof params.sectionKey === "string" ? params.sectionKey.trim() : "";
  try {
    const registered = await registerExistingFigure({
      projectId: ctx.projectId!,
      userId: ctx.userId,
      source: buf,
      originalName: owned.row.originalName,
      caption: item.label || owned.row.originalName,
      sectionKey: sectionKey || undefined,
    });
    const readings = item.readings ?? [];
    let claimCount = 0;
    if (readings.length > 0) {
      const sourceId = normalizeIngestSourceId(owned.row.originalName);
      const evidence = figureReadingsToEvidence(owned.row.originalName, sourceId, readings);
      await persistIngestedAnalysis({
        userId: ctx.userId,
        projectId: ctx.projectId!,
        analysis: evidence.analysis,
        claims: evidence.claims,
      });
      claimCount = evidence.claims.length;
    }
    return { ok: true, caption: item.label, insertedSection: registered.insertedSection, claimCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : "成图登记失败";
    return { ok: false, error: message };
  }
}
