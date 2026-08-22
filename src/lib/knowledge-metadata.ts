import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import type { KnowledgeBib, KnowledgeFileRecord } from "@/contracts/knowledge";
import type { BibEntry } from "@/lib/rag";
import {
  lookupMetricsForBib,
  mergeJournalMetrics,
  parseJournalMetricsUpload,
  parseMetricsJson,
  serializeMetrics,
  type ApplyJournalMetricsResult,
  type JournalMetricsLookup,
} from "@/lib/journal-metrics";
import {
  assertResolvedInsideBase,
  assertSafePathSegment,
  resolveKnowledgeFilePath,
} from "@/lib/safe-path";

const METADATA_PATH = resolveProjectRuntimePath("data/metadata.json");
const DATA_DIR = resolveProjectRuntimePath("data");
const ARTICLES_DIR = resolveProjectRuntimePath(process.env.RAG_ARTICLES_DIR || "papers");

/** 仅迁移/应急：只读 data/metadata.json，默认关闭 */
export function isMetadataJsonFallbackEnabled(): boolean {
  return process.env.USE_METADATA_JSON_FALLBACK === "true";
}

export function loadMetadataJsonFallback(): KnowledgeFileRecord[] {
  if (!fs.existsSync(METADATA_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8")) as KnowledgeFileRecord[];
  } catch {
    return [];
  }
}

function parseBibField(bib: string | null): KnowledgeBib | null {
  if (!bib) return null;
  try {
    return JSON.parse(bib) as KnowledgeBib;
  } catch {
    return null;
  }
}

type KnowledgeFileRow = {
  name: string;
  category: string;
  documentType: string;
  size: number;
  mtime: Date | null;
  bib: string | null;
  gbTag: string | null;
  parseWarning: string | null;
  bibEdited: boolean;
  chunkCount?: number;
  metrics?: string | null;
  _count?: { chunks: number };
};

export interface KnowledgePdfDiskResolution {
  path: string | null;
  /** 磁盘上实际所在分类（可能与 Prisma 不一致） */
  resolvedCategory: string | null;
  size: number;
}

type ArticlesFileIndexEntry = {
  path: string;
  resolvedCategory: string;
  size: number;
};

let articlesFileIndex: Map<string, ArticlesFileIndexEntry> | null = null;

/** 单次请求内扫描 papers/ 一次，按文件名 O(1) 查找（避免每行递归遍历） */
function buildArticlesFileIndex(): Map<string, ArticlesFileIndexEntry> {
  const index = new Map<string, ArticlesFileIndexEntry>();
  if (!fs.existsSync(ARTICLES_DIR)) return index;

  const walk = (dir: string): void => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      try {
        assertResolvedInsideBase(ARTICLES_DIR, full);
      } catch {
        continue;
      }
      if (index.has(entry.name)) continue;
      index.set(entry.name, {
        path: full,
        resolvedCategory: categoryFromArticlesPath(full),
        size: fs.statSync(full).size,
      });
    }
  };

  walk(ARTICLES_DIR);
  return index;
}

function getArticlesFileIndex(): Map<string, ArticlesFileIndexEntry> {
  if (!articlesFileIndex) {
    articlesFileIndex = buildArticlesFileIndex();
  }
  return articlesFileIndex;
}

function categoryFromArticlesPath(filePath: string): string {
  const rel = path.relative(ARTICLES_DIR, filePath);
  const parts = rel.split(path.sep).filter(Boolean);
  if (parts.length <= 1) return "未分类";
  return parts[0] ?? "未分类";
}

/** 按文件名定位 PDF：先 Prisma 分类路径，再全库递归（与 /api/pdf 一致） */
export function resolveKnowledgePdfOnDisk(
  name: string,
  category: string,
): KnowledgePdfDiskResolution {
  try {
    const direct = resolveKnowledgeFilePath(ARTICLES_DIR, category, name);
    if (fs.existsSync(direct)) {
      const size = fs.statSync(direct).size;
      return { path: direct, resolvedCategory: category, size };
    }
  } catch {
    /* 分类名非法等 */
  }

  const indexed = getArticlesFileIndex().get(name);
  if (indexed) {
    return {
      path: indexed.path,
      resolvedCategory: indexed.resolvedCategory,
      size: indexed.size,
    };
  }

  return { path: null, resolvedCategory: null, size: 0 };
}

const pdfDiskCache = new Map<string, KnowledgePdfDiskResolution>();

/** 单次 API 请求内复用同名 PDF 的磁盘解析结果 */
export function resolveKnowledgePdfOnDiskCached(
  name: string,
  category: string,
): KnowledgePdfDiskResolution {
  const cached = pdfDiskCache.get(name);
  if (cached) return cached;
  const resolved = resolveKnowledgePdfOnDisk(name, category);
  pdfDiskCache.set(name, resolved);
  return resolved;
}

export function clearKnowledgePdfDiskCache(): void {
  pdfDiskCache.clear();
  articlesFileIndex = null;
}

/** 从磁盘 stat PDF 字节数（Prisma size 为 0 或路径不一致时回退） */
export function statKnowledgeFileDiskSize(name: string, category: string): number | null {
  const disk = resolveKnowledgePdfOnDiskCached(name, category);
  return disk.path && disk.size > 0 ? disk.size : null;
}

export function enrichKnowledgeRecordFromDisk(record: KnowledgeFileRecord): KnowledgeFileRecord {
  if (record.size > 0) {
    try {
      const direct = resolveKnowledgeFilePath(ARTICLES_DIR, record.category, record.name);
      if (fs.existsSync(direct)) {
        return { ...record, hasPdfOnDisk: true };
      }
    } catch {
      /* 分类名非法等，走索引查找 */
    }
  }

  const disk = resolveKnowledgePdfOnDiskCached(record.name, record.category);
  const hasPdfOnDisk = disk.path != null && disk.size > 0;
  const size = hasPdfOnDisk ? Math.max(record.size, disk.size) : record.size;

  const next: KnowledgeFileRecord = {
    ...record,
    size,
    hasPdfOnDisk,
  };

  if (
    hasPdfOnDisk
    && disk.resolvedCategory
    && disk.resolvedCategory !== record.category
  ) {
    next.diskCategory = disk.resolvedCategory;
  }

  if (size > 0 && record.size <= 0) {
    persistKnowledgeFileSizeIfMissing(record.name, record.category, size);
  }

  return next;
}

export type KnowledgeRecordOptions = {
  /** 列表大批量拉取时可关闭，避免整库扫描 papers/ */
  enrichDisk?: boolean;
};

/** 列表 API 发现 size=0 时异步回写 Prisma，避免每次 stat */
export function persistKnowledgeFileSizeIfMissing(
  name: string,
  category: string,
  size: number,
): void {
  if (size <= 0) return;
  void prisma.knowledgeFile
    .updateMany({ where: { name, size: 0 }, data: { size } })
    .catch(() => {});
}

export function prismaRowToKnowledgeRecord(
  row: KnowledgeFileRow,
  options?: KnowledgeRecordOptions,
): KnowledgeFileRecord {
  const prismaChunks = row._count?.chunks ?? 0;
  const chunkCount = Math.max(row.chunkCount ?? 0, prismaChunks);
  const record: KnowledgeFileRecord = {
    name: row.name,
    category: row.category,
    documentType: row.documentType,
    chunkCount,
    size: row.size,
    mtime: row.mtime?.toISOString() ?? "",
    bib: parseBibField(row.bib),
    gbTag: row.gbTag,
    parseWarning: row.parseWarning as KnowledgeFileRecord["parseWarning"],
    bibEdited: row.bibEdited,
    metrics: parseMetricsJson(row.metrics ?? null),
  };
  if (options?.enrichDisk === false) {
    return record;
  }
  return enrichKnowledgeRecordFromDisk(record);
}

export interface JournalMetricsImportSummary extends ApplyJournalMetricsResult {
  lookupSize: number;
  lookupIssn: number;
  lookupJournal: number;
  totalFiles: number;
}

/** 将实验室期刊表（CSV/Excel）指标写入 KnowledgeFile.metrics */
export async function applyJournalMetricsFromLookup(
  lookup: JournalMetricsLookup,
  options?: { dryRun?: boolean },
): Promise<JournalMetricsImportSummary> {
  const files = await prisma.knowledgeFile.findMany({
    select: { id: true, bib: true, metrics: true },
  });

  let matched = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of files) {
    const bib = parseBibField(file.bib);
    const incoming = lookupMetricsForBib(bib, lookup);
    if (!incoming) {
      skipped++;
      continue;
    }
    matched++;
    const merged = mergeJournalMetrics(parseMetricsJson(file.metrics), incoming);
    if (!options?.dryRun) {
      await prisma.knowledgeFile.update({
        where: { id: file.id },
        data: { metrics: serializeMetrics(merged) },
      });
    }
    updated++;
  }

  return {
    matched,
    updated,
    skipped,
    totalFiles: files.length,
    lookupSize: lookup.byIssn.size + lookup.byJournal.size,
    lookupIssn: lookup.byIssn.size,
    lookupJournal: lookup.byJournal.size,
  };
}

/** 解析上传文件并导入期刊指标 */
export async function applyJournalMetricsFromUpload(
  content: string | ArrayBuffer,
  options?: { dryRun?: boolean; filename?: string },
): Promise<JournalMetricsImportSummary> {
  const lookup = await parseJournalMetricsUpload(content, options?.filename);
  return applyJournalMetricsFromLookup(lookup, options);
}

export async function getKnowledgeFileByName(name: string): Promise<KnowledgeFileRecord | null> {
  const row = await prisma.knowledgeFile.findUnique({
    where: { name },
    include: { _count: { select: { chunks: true } } },
  });
  if (row) return prismaRowToKnowledgeRecord(row);

  if (isMetadataJsonFallbackEnabled()) {
    return loadMetadataJsonFallback().find((m) => m.name === name) ?? null;
  }
  return null;
}

/**
 * 知识库分类列表（不含「全部」）。
 * @param includeUncategorized 为 true 时纳入「未分类」（RAG 检索侧需要遍历 index_未分类.json；
 *   否则「未分类」目录下的 PDF 永远检索不到）。默认 false 供 UI/分类匹配使用。
 *
 * RAG 侧还会合并 `data/index_*.json` 磁盘分类，避免「外部摘要」等仅有索引文件、
 * Prisma 尚未对齐时检索扫不到。
 */
export async function listKnowledgeCategories(
  includeUncategorized = false,
): Promise<string[]> {
  const rows = await prisma.knowledgeFile.findMany({
    select: { category: true },
    distinct: ["category"],
  });
  const keepCat = (c: string | null | undefined): boolean =>
    Boolean(c) && (includeUncategorized || c !== "未分类");
  const fromDb = rows.map((r) => r.category).filter(keepCat);

  const fromDisk = listCategoriesFromIndexFiles().filter(keepCat);

  if (!isMetadataJsonFallbackEnabled()) {
    return Array.from(new Set([...fromDb, ...fromDisk]));
  }

  const fromJson = loadMetadataJsonFallback()
    .map((m) => m.category)
    .filter(keepCat);
  return Array.from(new Set([...fromDb, ...fromDisk, ...fromJson]));
}

/** 扫描 data/index_<分类>.json → 分类名（供 RAG 发现外部摘要等） */
function listCategoriesFromIndexFiles(): string[] {
  try {
    const dataDir = resolveProjectRuntimePath("data");
    if (!fs.existsSync(dataDir)) return [];
    return fs
      .readdirSync(dataDir)
      .filter((f) => f.startsWith("index_") && f.endsWith(".json"))
      .map((f) => f.slice("index_".length, -".json".length))
      .filter((c) => Boolean(c) && !c.includes(".") && c !== "json");
  } catch {
    return [];
  }
}

/** 按研究方向关键词匹配最相关的分类（大纲等场景） */
export async function matchCategoryFromDirection(direction: string): Promise<string | null> {
  const kw = direction.trim().toLowerCase();
  if (!kw) return null;

  const categories = await listKnowledgeCategories();
  if (categories.length === 0) return null;

  const matches = categories
    .map((cat) => ({
      cat,
      score: cat.split(/[\s\-_]/).filter((w) => kw.includes(w.toLowerCase())).length,
    }))
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score);

  return matches[0]?.cat ?? null;
}

function recordToBibEntry(entry: KnowledgeFileRecord): BibEntry {
  return {
    name: entry.name,
    category: entry.category,
    chunkCount: entry.chunkCount ?? 0,
    documentType: entry.documentType,
    gbTag: entry.gbTag ?? undefined,
    bib: entry.bib ?? undefined,
  };
}

function mergeBibEntry(map: Map<string, BibEntry>, entry: KnowledgeFileRecord): void {
  if (!entry?.name) return;
  const bibEntry = recordToBibEntry(entry);
  const prev = map.get(entry.name);
  if (!prev) {
    map.set(entry.name, bibEntry);
    return;
  }
  const prevScore = (prev.documentType ? 1 : 0) + (prev.bib ? 2 : 0);
  const nextScore = (bibEntry.documentType ? 1 : 0) + (bibEntry.bib ? 2 : 0);
  map.set(entry.name, nextScore >= prevScore ? bibEntry : prev);
}

/** 从 Prisma（+ 可选 JSON 回退）构建书目 Map，供 RAG 引用格式化 */
export async function buildBibMap(): Promise<Map<string, BibEntry>> {
  const map = new Map<string, BibEntry>();

  const files = await prisma.knowledgeFile.findMany({
    include: { _count: { select: { chunks: true } } },
  });
  for (const f of files) {
    mergeBibEntry(map, prismaRowToKnowledgeRecord(f));
  }

  if (isMetadataJsonFallbackEnabled()) {
    for (const m of loadMetadataJsonFallback()) {
      mergeBibEntry(map, m);
    }
  }

  return map;
}

let bibMapCache: Map<string, BibEntry> | null = null;
let bibMapLoading: Promise<Map<string, BibEntry>> | null = null;

export async function ensureBibMapLoaded(): Promise<Map<string, BibEntry>> {
  if (bibMapCache) return bibMapCache;
  if (!bibMapLoading) {
    bibMapLoading = buildBibMap().then((m) => {
      bibMapCache = m;
      bibMapLoading = null;
      return m;
    });
  }
  return bibMapLoading;
}

export function getCachedBibMap(): Map<string, BibEntry> {
  return bibMapCache ?? new Map();
}

export function invalidateKnowledgeBibCache(): void {
  bibMapCache = null;
  bibMapLoading = null;
}
