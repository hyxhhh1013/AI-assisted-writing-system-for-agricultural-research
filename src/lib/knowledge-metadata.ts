import fs from "fs";
import path from "path";
import prisma from "@/lib/prisma";
import type { KnowledgeBib, KnowledgeFileRecord } from "@/contracts/knowledge";
import type { BibEntry } from "@/lib/rag";
import {
  lookupMetricsForBib,
  mergeJournalMetrics,
  parseJournalMetricsCsv,
  parseMetricsJson,
  serializeMetrics,
  type ApplyJournalMetricsResult,
} from "@/lib/journal-metrics";
import { resolveKnowledgeFilePath } from "@/lib/safe-path";

const METADATA_PATH = path.join(process.cwd(), "data/metadata.json");
const DATA_DIR = path.join(process.cwd(), "data");
const ARTICLES_DIR = path.join(process.cwd(), process.env.RAG_ARTICLES_DIR || "papers");

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

/** 从磁盘 stat PDF 字节数（Prisma size 为 0 时回退） */
export function statKnowledgeFileDiskSize(name: string, category: string): number | null {
  try {
    const filePath = resolveKnowledgeFilePath(ARTICLES_DIR, category, name);
    if (!fs.existsSync(filePath)) return null;
    return fs.statSync(filePath).size;
  } catch {
    return null;
  }
}

export function enrichKnowledgeRecordFromDisk(record: KnowledgeFileRecord): KnowledgeFileRecord {
  if (record.size > 0) return record;
  const diskSize = statKnowledgeFileDiskSize(record.name, record.category);
  if (diskSize != null && diskSize > 0) {
    return { ...record, size: diskSize };
  }
  return record;
}

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

export function prismaRowToKnowledgeRecord(row: KnowledgeFileRow): KnowledgeFileRecord {
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
  return enrichKnowledgeRecordFromDisk(record);
}

/** 将实验室 CSV 期刊指标按 ISSN 写入 KnowledgeFile.metrics */
export async function applyJournalMetricsFromCsv(
  csvText: string,
  options?: { dryRun?: boolean },
): Promise<ApplyJournalMetricsResult & { lookupSize: number }> {
  const lookup = parseJournalMetricsCsv(csvText);
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

  return { matched, updated, skipped, lookupSize: lookup.size };
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

/** 知识库分类列表（不含「全部」） */
export async function listKnowledgeCategories(): Promise<string[]> {
  const rows = await prisma.knowledgeFile.findMany({
    select: { category: true },
    distinct: ["category"],
  });
  const fromDb = rows
    .map((r) => r.category)
    .filter((c) => c && c !== "未分类");

  if (!isMetadataJsonFallbackEnabled()) {
    return Array.from(new Set(fromDb));
  }

  const fromJson = loadMetadataJsonFallback()
    .map((m) => m.category)
    .filter((c) => c && c !== "未分类");
  return Array.from(new Set([...fromDb, ...fromJson]));
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
