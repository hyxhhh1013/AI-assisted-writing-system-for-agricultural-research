/**
 * 外部文献 → 知识库入库
 *
 * - 有 OA PDF（ENABLE_OA_AUTO_IMPORT）：下载 → papers/<分类>/ → 增量 index-pdfs
 * - 有摘要无 PDF：KnowledgeFile + 追加 index_{分类}.json（BM25）
 * - 无摘要无 PDF：仅书目占位（chunkCount=0）
 */

import fs from "fs";
import path from "path";
import type { ExternalLiteratureHit } from "@/contracts/literature";
import type { KnowledgeBib } from "@/contracts/knowledge";
import type { RagChunk } from "@/lib/rag";
import { invalidateBibCache, localRAG } from "@/lib/rag";
import {
  generateBibliographyFileName,
  generateOaPdfFileName,
} from "@/lib/bib-import/import-names";
import { normalizeBibliographyDoi } from "@/lib/bib-import/doi";
import { matchCategoryFromDirection } from "@/lib/knowledge-metadata";
import {
  EXTERNAL_ABSTRACT_CATEGORY,
  inferPrimaryCategoryFromText,
} from "@/lib/knowledge-category-hints";
import { resolveProjectRuntimePath } from "@/lib/runtime-paths";
import { isSoftGroundable } from "@/lib/reference-evidence";
import { downloadOaPdf, isOaAutoImportEnabled } from "@/lib/oa-download";
import { runPartialPdfIndex } from "@/lib/knowledge-partial-reindex";
import { resolveKnowledgeFilePath } from "@/lib/safe-path";
import prisma from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger("external-knowledge-ingest");

const DATA_DIR = resolveProjectRuntimePath("data");
const ARTICLES_DIR = resolveProjectRuntimePath(process.env.RAG_ARTICLES_DIR || "papers");
/** @deprecated 使用 knowledge-category-hints 导出；此处 re-export 保持兼容 */
export { EXTERNAL_ABSTRACT_CATEGORY } from "@/lib/knowledge-category-hints";
const FALLBACK_CATEGORY = EXTERNAL_ABSTRACT_CATEGORY;
const ABS_CHUNK_SIZE = 1200;

export type ExternalKnowledgeIngestMode = "pdf" | "abstract" | "bib_only";

export interface ExternalKnowledgeIngestResult {
  name: string;
  category: string;
  created: boolean;
  updated: boolean;
  chunkCount: number;
  mode: ExternalKnowledgeIngestMode;
  reason?: string;
  pdfBytes?: number;
}

export interface ExternalKnowledgeIngestOptions {
  hit: ExternalLiteratureHit;
  category?: string;
  directionSlug?: string;
  researchDirection?: string;
  /** 默认跟随 ENABLE_OA_AUTO_IMPORT */
  tryOaPdf?: boolean;
}

type BibWithAbstract = KnowledgeBib & { abstract?: string; openAccessUrl?: string };

function hitToBib(hit: ExternalLiteratureHit): BibWithAbstract {
  const authors = hit.authors?.filter(Boolean) ?? [];
  return {
    title: hit.title?.trim() || undefined,
    authors: authors.length > 0 ? authors : undefined,
    firstAuthor: authors[0],
    year: hit.year,
    journal: hit.journal,
    volume: hit.volume,
    issue: hit.issue,
    pages: hit.pages,
    doi: hit.doi?.trim() || undefined,
    openAccessUrl: hit.openAccessUrl?.trim() || undefined,
    ...(hit.abstract?.trim()
      ? { abstract: hit.abstract.replace(/\s+/g, " ").trim().slice(0, 8000) }
      : {}),
  };
}

function splitAbstract(text: string, size: number): string[] {
  const t = text.trim();
  if (!t) return [];
  if (t.length <= size) return [t];
  const parts: string[] = [];
  for (let i = 0; i < t.length; i += size) parts.push(t.slice(i, i + size));
  return parts;
}

export async function resolveExternalIngestCategory(
  opts: Pick<
    ExternalKnowledgeIngestOptions,
    "category" | "directionSlug" | "researchDirection"
  > & {
    /** 题名 / 期刊 / 摘要等，用于关键词自动归类 */
    hintText?: string;
  },
): Promise<string> {
  if (opts.category?.trim()) return opts.category.trim();

  if (opts.directionSlug?.trim()) {
    const dir = await prisma.direction.findFirst({
      where: { slug: opts.directionSlug.trim() },
      select: { categories: true },
    });
    const cat = dir?.categories?.[0]?.trim();
    if (cat) return cat;
  }

  if (opts.researchDirection?.trim()) {
    const matched = await matchCategoryFromDirection(opts.researchDirection);
    if (matched) return matched;
  }

  if (opts.hintText?.trim()) {
    const fromHints = inferPrimaryCategoryFromText(opts.hintText);
    if (fromHints) return fromHints;
    const matched = await matchCategoryFromDirection(opts.hintText);
    if (matched) return matched;
  }

  return FALLBACK_CATEGORY;
}

function indexPathFor(category: string): string {
  return path.join(DATA_DIR, `index_${category}.json`);
}

function loadCategoryChunks(category: string): RagChunk[] {
  const p = indexPathFor(category);
  if (!fs.existsSync(p)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf-8")) as unknown;
    return Array.isArray(raw) ? (raw as RagChunk[]) : [];
  } catch {
    return [];
  }
}

/**
 * 仅追加，不删除/重排。
 * 物理索引一律写入「外部摘要」；`preferredCategory` 写入 metadata 供 UI / 范围检索归属实验室分类。
 */
function appendAbstractChunks(params: {
  /** UI / scoped 检索归属的实验室分类 */
  preferredCategory: string;
  sourceName: string;
  title: string;
  abstract: string;
}): { chunkCount: number; appended: boolean; indexCategory: string; preferredCategory: string } {
  const { sourceName, title, abstract } = params;
  const preferredCategory =
    params.preferredCategory?.trim() || EXTERNAL_ABSTRACT_CATEGORY;
  const indexCategory = EXTERNAL_ABSTRACT_CATEGORY;
  if (preferredCategory !== indexCategory) {
    log.info("abstract chunk indexed under external-abstract with preferred category", {
      preferredCategory,
      indexCategory,
      source: sourceName,
    });
  }

  const chunks = loadCategoryChunks(indexCategory);
  const existing = chunks.filter((c) => c.metadata?.source === sourceName);
  if (existing.length > 0) {
    // 已有 chunk：补写 preferredCategory，便于历史数据归属
    let patched = false;
    for (const c of existing) {
      if (c.metadata.preferredCategory !== preferredCategory) {
        c.metadata.preferredCategory = preferredCategory;
        patched = true;
      }
    }
    if (patched) {
      fs.writeFileSync(indexPathFor(indexCategory), JSON.stringify(chunks), "utf-8");
    }
    return {
      chunkCount: existing.length,
      appended: false,
      indexCategory,
      preferredCategory,
    };
  }

  const parts = splitAbstract(abstract, ABS_CHUNK_SIZE);
  const toAdd: RagChunk[] = parts.map((part, i) => ({
    content:
      i === 0
        ? `标题：${title}\n来源：外部导入（摘要，无 PDF）\n\n摘要：${part}`
        : part,
    metadata: {
      source: sourceName,
      category: indexCategory,
      preferredCategory,
      id: `${sourceName}#abs${i}`,
      documentType: "paper",
      chunkIndex: i,
    },
  }));

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  // 摘要分类禁止保留错位 .emb（仅文本 BM25；向量需全量/分类重建时按 JSON 长度重算）
  const embPath = path.join(DATA_DIR, `index_${indexCategory}.emb`);
  if (fs.existsSync(embPath)) {
    try {
      fs.unlinkSync(embPath);
      log.warn("removed stale .emb for abstract-only category after append", {
        category: indexCategory,
      });
    } catch (e) {
      log.warn("failed to remove stale abstract .emb", e);
    }
  }
  fs.writeFileSync(indexPathFor(indexCategory), JSON.stringify([...chunks, ...toAdd]), "utf-8");
  return {
    chunkCount: toAdd.length,
    appended: true,
    indexCategory,
    preferredCategory,
  };
}

async function findDuplicateFile(hit: ExternalLiteratureHit): Promise<{
  name: string;
  category: string;
  chunkCount: number;
  size: number;
  bib: string | null;
} | null> {
  const doi = normalizeBibliographyDoi(hit.doi);
  if (!doi) return null;
  const rows = await prisma.knowledgeFile.findMany({
    where: { bib: { contains: doi } },
    select: { name: true, category: true, chunkCount: true, size: true, bib: true },
    take: 20,
  });
  for (const row of rows) {
    try {
      const bib = row.bib ? (JSON.parse(row.bib) as KnowledgeBib) : null;
      if (normalizeBibliographyDoi(bib?.doi) === doi) return row;
    } catch {
      /* continue */
    }
  }
  return null;
}

async function listTakenNames(): Promise<Set<string>> {
  return new Set(
    (await prisma.knowledgeFile.findMany({ select: { name: true } })).map((r) => r.name),
  );
}

/**
 * 在 papers/ 下所有分类目录里查找同名 PDF（不区分大小写）。
 * 外部导入落盘前调用：检测「同名文件已存在于其他分类」的孤儿副本，
 * 避免再次制造跨分类同名（会被 index-pdfs 的 basename 去重静默吞掉）。
 */
function findPdfAcrossCategories(name: string): { category: string; path: string } | null {
  if (!fs.existsSync(ARTICLES_DIR)) return null;
  const baseName = path.basename(ARTICLES_DIR);
  const walk = (dir: string): { category: string; path: string } | null => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (entry.isFile() && entry.name.toLowerCase() === name.toLowerCase()) {
        const category = path.basename(dir) === baseName ? "未分类" : path.basename(dir);
        return { category, path: path.join(dir, entry.name) };
      }
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const hit = walk(path.join(dir, entry.name));
        if (hit) return hit;
      }
    }
    return null;
  };
  return walk(ARTICLES_DIR);
}

/**
 * 尝试 OA 下载并落盘；成功返回文件名与字节数。
 * 已有真实 PDF（size>0）的重复项跳过下载。
 */
async function trySaveOaPdf(params: {
  hit: ExternalLiteratureHit;
  category: string;
  preferredName?: string;
  taken: Set<string>;
}): Promise<{ name: string; bytes: number } | null> {
  const url = params.hit.openAccessUrl?.trim();
  if (!url) return null;
  if (!(await isOaAutoImportEnabled())) return null;

  const dl = await downloadOaPdf(url);
  if (!dl.ok) {
    log.warn("oa pdf skip", {
      title: params.hit.title?.slice(0, 60),
      reason: dl.reason,
      detail: dl.detail,
    });
    return null;
  }

  const title = params.hit.title?.trim() || "oa-paper";
  let name: string;
  if (params.preferredName?.trim()) {
    name = params.preferredName.trim();
    if (!name.toLowerCase().endsWith(".pdf")) name = `${name}.pdf`;
    params.taken.add(name);
  } else {
    name = generateOaPdfFileName(title, params.taken);
  }

  // 同名 PDF 已存在于其他分类目录：跳过下载，避免制造跨分类同名孤儿副本
  const existing = findPdfAcrossCategories(name);
  if (existing) {
    if (existing.category === params.category) {
      // 同名同分类：复用已有 PDF，不重复下载
      return { name, bytes: fs.statSync(existing.path).size };
    }
    log.warn("oa pdf name collision across categories, skip download", {
      name,
      existingCategory: existing.category,
      targetCategory: params.category,
    });
    return null;
  }

  const targetPath = resolveKnowledgeFilePath(ARTICLES_DIR, params.category, name);
  const targetDir = path.dirname(targetPath);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, dl.buffer);

  return { name, bytes: dl.buffer.length };
}

async function ingestOne(
  hit: ExternalLiteratureHit,
  opts: Omit<ExternalKnowledgeIngestOptions, "hit">,
): Promise<ExternalKnowledgeIngestResult & { indexMutated: boolean; reindexFile?: string }> {
  const title = hit.title?.trim() || "未命名文献";
  const bib = hitToBib(hit);
  const hintText = [title, hit.journal, hit.abstract].filter(Boolean).join(" ");
  const category = await resolveExternalIngestCategory({ ...opts, hintText });
  const hasAbs = isSoftGroundable(hit.abstract);
  const tryOa = opts.tryOaPdf !== false;

  const dup = await findDuplicateFile(hit);
  if (dup) {
    const prevBib = (() => {
      try {
        return dup.bib ? (JSON.parse(dup.bib) as KnowledgeBib) : {};
      } catch {
        return {};
      }
    })();
    await prisma.knowledgeFile.update({
      where: { name: dup.name },
      data: { bib: JSON.stringify({ ...prevBib, ...bib }), mtime: new Date() },
    });

    // 已有真实 PDF：只合并书目
    if (dup.size > 0) {
      return {
        name: dup.name,
        category: dup.category || category,
        created: false,
        updated: true,
        chunkCount: dup.chunkCount,
        mode: "pdf",
        reason: "doi_duplicate_pdf_exists",
        pdfBytes: dup.size,
        indexMutated: false,
      };
    }

    if (tryOa && hit.openAccessUrl) {
      const taken = await listTakenNames();
      const preferred =
        dup.name.toLowerCase().endsWith(".pdf") ? dup.name : undefined;
      const saved = await trySaveOaPdf({
        hit,
        category: dup.category || category,
        preferredName: preferred,
        taken,
      });
      if (saved) {
        if (saved.name === dup.name) {
          await prisma.knowledgeFile.update({
            where: { name: dup.name },
            data: {
              size: saved.bytes,
              mtime: new Date(),
              chunkCount: 0,
              documentType: "paper",
            },
          });
        } else {
          await prisma.knowledgeFile.create({
            data: {
              name: saved.name,
              category: dup.category || category,
              documentType: "paper",
              size: saved.bytes,
              chunkCount: 0,
              bib: JSON.stringify({ ...prevBib, ...bib }),
              bibEdited: false,
              mtime: new Date(),
            },
          });
        }

        return {
          name: saved.name,
          category: dup.category || category,
          created: saved.name !== dup.name,
          updated: saved.name === dup.name,
          chunkCount: 0,
          mode: "pdf",
          reason: "oa_pdf_downloaded",
          pdfBytes: saved.bytes,
          indexMutated: true,
          reindexFile: saved.name,
        };
      }
    }

    let chunkCount = dup.chunkCount;
    let mode: ExternalKnowledgeIngestMode = chunkCount > 0 ? "abstract" : "bib_only";
    let indexMutated = false;
    let mergedCategory = dup.category || category;

    if (hasAbs && chunkCount <= 0) {
      const { chunkCount: n, appended, preferredCategory } = appendAbstractChunks({
        preferredCategory: dup.category || category,
        sourceName: dup.name,
        title,
        abstract: hit.abstract!.trim(),
      });
      if (appended || n > 0) {
        chunkCount = n;
        mode = "abstract";
        indexMutated = appended;
        mergedCategory = preferredCategory;
        await prisma.knowledgeFile.update({
          where: { name: dup.name },
          data: { chunkCount: n, category: preferredCategory },
        });
      }
    }

    return {
      name: dup.name,
      category: mergedCategory,
      created: false,
      updated: true,
      chunkCount,
      mode,
      reason: "doi_duplicate_merged",
      indexMutated,
    };
  }

  const taken = await listTakenNames();

  if (tryOa && hit.openAccessUrl) {
    const saved = await trySaveOaPdf({ hit, category, taken });
    if (saved) {
      await prisma.knowledgeFile.create({
        data: {
          name: saved.name,
          category,
          documentType: "paper",
          size: saved.bytes,
          chunkCount: 0,
          bib: JSON.stringify(bib),
          bibEdited: false,
          mtime: new Date(),
        },
      });
      return {
        name: saved.name,
        category,
        created: true,
        updated: false,
        chunkCount: 0,
        mode: "pdf",
        reason: "oa_pdf_downloaded",
        pdfBytes: saved.bytes,
        indexMutated: true,
        reindexFile: saved.name,
      };
    }
  }

  const name = generateBibliographyFileName(hasAbs ? `[摘要] ${title}` : title, taken);

  let chunkCount = 0;
  let indexMutated = false;
  let uiCategory = category;
  if (hasAbs) {
    const { chunkCount: n, appended, preferredCategory } = appendAbstractChunks({
      preferredCategory: category,
      sourceName: name,
      title,
      abstract: hit.abstract!.trim(),
    });
    chunkCount = n;
    indexMutated = appended;
    uiCategory = preferredCategory;
  }

  await prisma.knowledgeFile.create({
    data: {
      name,
      category: uiCategory,
      documentType: "paper",
      size: 0,
      chunkCount,
      bib: JSON.stringify(bib),
      bibEdited: false,
      mtime: new Date(),
    },
  });

  return {
    name,
    category: uiCategory,
    created: true,
    updated: false,
    chunkCount,
    mode: hasAbs ? "abstract" : "bib_only",
    reason: hasAbs ? "abstract_indexed" : "bib_only_no_abstract",
    indexMutated,
  };
}

async function reindexAndReload(files: string[]): Promise<boolean> {
  const unique = [...new Set(files.filter(Boolean))];
  if (unique.length === 0) return true;
  const result = await runPartialPdfIndex(unique, { skipEmbed: true });
  if (!result.ok) {
    log.warn("oa pdf reindex failed", { files: unique, stderr: result.stderr.slice(0, 300) });
  }
  invalidateBibCache();
  await localRAG.reload().catch((e) => log.warn("rag reload after oa ingest", e));
  return result.ok;
}

export async function ingestExternalHitToKnowledge(
  opts: ExternalKnowledgeIngestOptions,
): Promise<ExternalKnowledgeIngestResult> {
  const { indexMutated, reindexFile, ...result } = await ingestOne(opts.hit, opts);
  invalidateBibCache();
  if (reindexFile) {
    const ok = await reindexAndReload([reindexFile]);
    const row = await prisma.knowledgeFile.findUnique({
      where: { name: result.name },
      select: { chunkCount: true },
    });
    if (row) result.chunkCount = row.chunkCount;
    if (!ok && result.chunkCount === 0) {
      result.reason = "oa_pdf_index_failed";
    }
  } else if (indexMutated) {
    await localRAG.reload().catch((e) => log.warn("rag reload after ingest", e));
  }
  return result;
}

export async function ingestExternalHitsToKnowledge(
  hits: ExternalLiteratureHit[],
  opts: Omit<ExternalKnowledgeIngestOptions, "hit">,
  onProgress?: (done: number, total: number, title: string) => void,
): Promise<{
  results: ExternalKnowledgeIngestResult[];
  created: number;
  updated: number;
  withAbstract: number;
  withPdf: number;
}> {
  const results: ExternalKnowledgeIngestResult[] = [];
  let created = 0;
  let updated = 0;
  let withAbstract = 0;
  let withPdf = 0;
  let needReload = false;
  const reindexFiles: string[] = [];

  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i]!;
    const { indexMutated, reindexFile, ...r } = await ingestOne(hit, opts);
    results.push(r);
    onProgress?.(i + 1, hits.length, hit.title?.trim().slice(0, 80) || "未命名文献");
    if (r.created) created += 1;
    if (r.updated) updated += 1;
    if (r.mode === "abstract") withAbstract += 1;
    if (r.mode === "pdf") withPdf += 1;
    if (reindexFile) reindexFiles.push(reindexFile);
    else if (indexMutated) needReload = true;
  }

  if (reindexFiles.length > 0) {
    const ok = await reindexAndReload(reindexFiles);
    for (const r of results) {
      if (r.mode !== "pdf") continue;
      const row = await prisma.knowledgeFile.findUnique({
        where: { name: r.name },
        select: { chunkCount: true },
      });
      if (row) r.chunkCount = row.chunkCount;
      if (!ok && r.chunkCount === 0) r.reason = "oa_pdf_index_failed";
    }
  } else {
    invalidateBibCache();
    if (needReload) {
      await localRAG.reload().catch((e) => log.warn("rag reload after batch ingest", e));
    }
  }

  return { results, created, updated, withAbstract, withPdf };
}

export interface RebuildExternalAbstractsOptions {
  /** 仅处理 chunkCount===0（默认 true）；false 时也会补 preferredCategory / 修正 UI 分类 */
  onlyMissingChunks?: boolean;
  /** 干跑：只统计不写盘 */
  dryRun?: boolean;
  /** 覆盖自动归类时的研究方向提示 */
  researchDirection?: string;
}

export interface RebuildExternalAbstractsResult {
  scanned: number;
  indexed: number;
  categoryUpdated: number;
  skipped: number;
  dryRun: boolean;
  samples: Array<{ name: string; category: string; chunkCount: number; action: string }>;
}

/**
 * 把已入库、无 PDF、有摘要的 KnowledgeFile 补建「外部摘要」索引，并自动归类到实验室分类。
 * 物理 chunk 仍在 index_外部摘要.json；Prisma.category / metadata.preferredCategory = 实验室分类。
 */
export async function rebuildExternalAbstractIndexes(
  opts: RebuildExternalAbstractsOptions = {},
): Promise<RebuildExternalAbstractsResult> {
  const onlyMissing = opts.onlyMissingChunks !== false;
  const dryRun = opts.dryRun === true;
  const rows = await prisma.knowledgeFile.findMany({
    where: { size: 0 },
    select: { name: true, category: true, chunkCount: true, bib: true },
  });

  let indexed = 0;
  let categoryUpdated = 0;
  let skipped = 0;
  const samples: RebuildExternalAbstractsResult["samples"] = [];
  let mutated = false;

  for (const row of rows) {
    let bib: KnowledgeBib & { abstract?: string } = {};
    try {
      bib = row.bib ? (JSON.parse(row.bib) as KnowledgeBib & { abstract?: string }) : {};
    } catch {
      skipped += 1;
      continue;
    }
    const abstract = typeof bib.abstract === "string" ? bib.abstract.trim() : "";
    if (!isSoftGroundable(abstract)) {
      skipped += 1;
      continue;
    }

    const title =
      bib.title?.trim() ||
      row.name.replace(/^\[(摘要|书目)\]\s*/, "").replace(/\.pdf$/i, "") ||
      row.name;
    const hintText = [title, bib.journal, abstract].filter(Boolean).join(" ");
    const preferred = await resolveExternalIngestCategory({
      researchDirection: opts.researchDirection,
      hintText,
      // 已有明确实验室分类则保留；「外部摘要/未分类」允许重算
      category:
        row.category &&
        row.category !== EXTERNAL_ABSTRACT_CATEGORY &&
        row.category !== "未分类"
          ? row.category
          : undefined,
    });

    const needsChunks = row.chunkCount <= 0;
    if (onlyMissing && !needsChunks && row.category === preferred) {
      skipped += 1;
      continue;
    }

    if (dryRun) {
      samples.push({
        name: row.name,
        category: preferred,
        chunkCount: needsChunks ? 1 : row.chunkCount,
        action: needsChunks ? "would_index" : "would_fix_category",
      });
      if (needsChunks) indexed += 1;
      else categoryUpdated += 1;
      continue;
    }

    const { chunkCount, appended, preferredCategory } = appendAbstractChunks({
      preferredCategory: preferred,
      sourceName: row.name,
      title,
      abstract,
    });
    if (appended) {
      indexed += 1;
      mutated = true;
    }

    const catChanged = row.category !== preferredCategory || row.chunkCount !== chunkCount;
    if (catChanged) {
      await prisma.knowledgeFile.update({
        where: { name: row.name },
        data: { category: preferredCategory, chunkCount, mtime: new Date() },
      });
      if (row.category !== preferredCategory) categoryUpdated += 1;
      mutated = true;
    }

    if (samples.length < 30) {
      samples.push({
        name: row.name,
        category: preferredCategory,
        chunkCount,
        action: appended ? "indexed" : catChanged ? "category_fixed" : "noop",
      });
    }
  }

  if (mutated && !dryRun) {
    invalidateBibCache();
    await localRAG.reload().catch((e) => log.warn("rag reload after rebuild abstracts", e));
  }

  return {
    scanned: rows.length,
    indexed,
    categoryUpdated,
    skipped,
    dryRun,
    samples,
  };
}
