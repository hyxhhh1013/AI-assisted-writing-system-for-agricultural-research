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
const FALLBACK_CATEGORY = "外部摘要";
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
  >,
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

/** 仅追加，不删除/重排，避免与 index_*.emb 下标错位 */
function appendAbstractChunks(params: {
  category: string;
  sourceName: string;
  title: string;
  abstract: string;
}): { chunkCount: number; appended: boolean } {
  const { category, sourceName, title, abstract } = params;
  const chunks = loadCategoryChunks(category);
  const existing = chunks.filter((c) => c.metadata?.source === sourceName);
  if (existing.length > 0) {
    return { chunkCount: existing.length, appended: false };
  }

  const parts = splitAbstract(abstract, ABS_CHUNK_SIZE);
  const toAdd: RagChunk[] = parts.map((part, i) => ({
    content:
      i === 0
        ? `标题：${title}\n来源：外部导入（摘要，无 PDF）\n\n摘要：${part}`
        : part,
    metadata: {
      source: sourceName,
      category,
      id: `${sourceName}#abs${i}`,
      documentType: "paper",
      chunkIndex: i,
    },
  }));

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(indexPathFor(category), JSON.stringify([...chunks, ...toAdd]), "utf-8");
  return { chunkCount: toAdd.length, appended: true };
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
  const category = await resolveExternalIngestCategory(opts);
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

    if (hasAbs && chunkCount <= 0) {
      const { chunkCount: n, appended } = appendAbstractChunks({
        category: dup.category || category,
        sourceName: dup.name,
        title,
        abstract: hit.abstract!.trim(),
      });
      if (appended) {
        chunkCount = n;
        mode = "abstract";
        indexMutated = true;
        await prisma.knowledgeFile.update({
          where: { name: dup.name },
          data: { chunkCount: n },
        });
      }
    }

    return {
      name: dup.name,
      category: dup.category || category,
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
  if (hasAbs) {
    const { chunkCount: n, appended } = appendAbstractChunks({
      category,
      sourceName: name,
      title,
      abstract: hit.abstract!.trim(),
    });
    chunkCount = n;
    indexMutated = appended;
  }

  await prisma.knowledgeFile.create({
    data: {
      name,
      category,
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
    category,
    created: true,
    updated: false,
    chunkCount,
    mode: hasAbs ? "abstract" : "bib_only",
    reason: hasAbs ? "abstract_indexed" : "bib_only_no_abstract",
    indexMutated,
  };
}

async function reindexAndReload(files: string[]): Promise<void> {
  const unique = [...new Set(files.filter(Boolean))];
  if (unique.length === 0) return;
  const result = await runPartialPdfIndex(unique, { skipEmbed: true });
  if (!result.ok) {
    log.warn("oa pdf reindex failed", { files: unique, stderr: result.stderr.slice(0, 300) });
  }
  invalidateBibCache();
  await localRAG.reload().catch((e) => log.warn("rag reload after oa ingest", e));
}

export async function ingestExternalHitToKnowledge(
  opts: ExternalKnowledgeIngestOptions,
): Promise<ExternalKnowledgeIngestResult> {
  const { indexMutated, reindexFile, ...result } = await ingestOne(opts.hit, opts);
  invalidateBibCache();
  if (reindexFile) {
    await reindexAndReload([reindexFile]);
    const row = await prisma.knowledgeFile.findUnique({
      where: { name: result.name },
      select: { chunkCount: true },
    });
    if (row) result.chunkCount = row.chunkCount;
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
    await reindexAndReload(reindexFiles);
    for (const r of results) {
      if (r.mode !== "pdf") continue;
      const row = await prisma.knowledgeFile.findUnique({
        where: { name: r.name },
        select: { chunkCount: true },
      });
      if (row) r.chunkCount = row.chunkCount;
    }
  } else {
    invalidateBibCache();
    if (needReload) {
      await localRAG.reload().catch((e) => log.warn("rag reload after batch ingest", e));
    }
  }

  return { results, created, updated, withAbstract, withPdf };
}
