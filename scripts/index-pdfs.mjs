/**
 * RAG 索引构建 — 三阶段增量架构
 *
 *   阶段 1: PDF → Chunks  →  缓存到 data/chunks_raw/<hash>.json
 *   阶段 2: Chunk 过滤    →  只写变更文献所在分类（merge + 保留 .emb；见 scripts/lib/index-emb-io.mjs）
 *   阶段 3: Embedding     →  仅对新/无向量的 chunk 调 API
 *
 * 使用：
 *   node scripts/index-pdfs.mjs                  完整构建（增量）
 *   node scripts/index-pdfs.mjs --force-stage1   强制重解析所有 PDF
 *   node scripts/index-pdfs.mjs --force-stage3   强制重算所有 embedding
 *   node scripts/index-pdfs.mjs --skip-stage3    跳过 embedding（仅 BM25）
 *   node scripts/index-pdfs.mjs --stage2-only    仅运行过滤+写出（最快，改过滤规则后使用）
 *   node scripts/index-pdfs.mjs --files=a.pdf,b.pdf  仅处理指定文献（可配合 force-stage1/3）
 *   node scripts/index-pdfs.mjs --rechunk            把 schemaVersion<2 的缓存当 miss（按 IMRaD 重切，不默认全库重解析）
 *   RAG_RECHUNK=1                                    同上
 *   node scripts/index-pdfs.mjs --enrich-metrics     Stage 2 后对本次文献 OpenAlex 补被引/ISSN（限 20 篇）
 *   ENRICH_OPENALEX_AFTER_INDEX=true                   同上，环境变量开启
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from "dotenv";
import { extractDocMetadata } from "./doc-type-registry.mjs";
import { groupTextContentLines } from "./extractors/header-lines.mjs";
import {
  mergeCategoryChunks,
  pruneStage1Orphans,
  writeCategoryIndexFiles,
} from "./lib/index-emb-io.mjs";
import { isLikelyReferencesText } from "./lib/index-text-filters.mjs";
import { CHUNK_SCHEMA_VERSION, segmentLinesBySection } from "./lib/paper-section.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(projectRoot, ".env.local") });

// ─── CLI flags ────────────────────────────────────────────────────────────────
function parseFileFilter() {
  const arg = process.argv.find((a) => a.startsWith("--files="));
  if (!arg) return null;
  const raw = arg.slice("--files=".length);
  if (!raw.trim()) return null;
  return new Set(
    raw.split(",").map((s) => decodeURIComponent(s.trim())).filter(Boolean),
  );
}

const FLAGS = {
  forceStage1: process.argv.includes("--force-stage1"),
  forceStage3: process.argv.includes("--force-stage3"),
  skipStage3:  process.argv.includes("--skip-stage3"),
  stage2Only:  process.argv.includes("--stage2-only"),
  progress:    process.argv.includes("--progress"),
  verbose:     process.argv.includes("--verbose"),
  fileFilter:  parseFileFilter(),
  /** 仅把旧切块 schema 当 cache miss；默认增量仍只看 mtime，避免全库重解析 */
  rechunk: process.argv.includes("--rechunk") || process.env.RAG_RECHUNK === "1",
  /** 每个 batch 之间的延迟（毫秒），用于控制 API 调用频率 */
  embedDelay:  parseInt(process.argv.find(a => a.startsWith("--embed-delay="))?.split("=")[1] || "0", 10),
};

function isPartialReindex() {
  return FLAGS.fileFilter != null && FLAGS.fileFilter.size > 0;
}

function shouldForceStage1ForFile(name) {
  if (!FLAGS.forceStage1) return false;
  if (!isPartialReindex()) return true;
  return FLAGS.fileFilter.has(name);
}

function shouldForceStage3ForFile(name) {
  if (!FLAGS.forceStage3) return false;
  if (!isPartialReindex()) return true;
  return FLAGS.fileFilter.has(name);
}

// ─── Paths ────────────────────────────────────────────────────────────────────
const ARTICLES_DIR = path.resolve(projectRoot, process.env.RAG_ARTICLES_DIR || "papers");
const DATA_DIR = path.join(projectRoot, "data");
const RAW_DIR = path.join(DATA_DIR, "chunks_raw");
const STAGE1_STATE = path.join(RAW_DIR, "_stage1_state.json");  // { filename → { mtime, hash } }
const EMBED_STATE = path.join(DATA_DIR, "_embed_state.json");   // { model → chunkCount }
const METADATA_PATH = path.join(DATA_DIR, "metadata.json");

const API_KEY = process.env.RAG_EMBEDDING_API_KEY?.trim()
  || (process.env.RAG_EMBEDDINGS_URL?.trim() ? process.env.DEEPSEEK_API_KEY?.trim() : undefined)
  || (process.env.RAG_EMBEDDING_API_BASE?.trim() ? process.env.DEEPSEEK_API_KEY?.trim() : undefined);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function emitProgress(payload) {
  if (FLAGS.progress) process.stdout.write(`__INDEX_PROGRESS__${JSON.stringify(payload)}\n`);
}

function hashFilename(name) {
  return crypto.createHash("md5").update(name).digest("hex").slice(0, 12);
}

function rawChunkPath(filename) {
  return path.join(RAW_DIR, `${hashFilename(filename)}.json`);
}

function loadJSON(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  try { return JSON.parse(fs.readFileSync(filePath, "utf-8")); }
  catch { return fallback; }
}

function saveJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function writeCategoryIndex(cat, chunks, opts = {}) {
  const indexPath = path.join(DATA_DIR, `index_${cat}.json`);
  const embPath = path.join(DATA_DIR, `index_${cat}.emb`);
  return writeCategoryIndexFiles({
    indexPath,
    embPath,
    chunks,
    previousChunks: opts.previousChunks ?? null,
    skipEmbRewrite: opts.skipEmbRewrite ?? false,
  });
}

/** 按 y/x 坐标排序后拼接，比简单 join 更保序 */
function extractPageText(textContent) {
  const items = (textContent.items || [])
    .filter((item) => typeof item.str === "string" && item.str.trim())
    .sort((a, b) => {
      const ay = a.transform?.[5] ?? 0;
      const by = b.transform?.[5] ?? 0;
      if (Math.abs(ay - by) > 2) return by - ay;
      return (a.transform?.[4] ?? 0) - (b.transform?.[4] ?? 0);
    });
  return items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim();
}

/** 中文 PDF 首页常较短，单独放宽阈值 */
function isPageTextUsable(text) {
  if (!text) return false;
  if (text.length >= 30) return true;
  const cjkCount = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  return cjkCount >= 8;
}

function isStage1CacheFresh(fileInfo, prev) {
  if (shouldForceStage1ForFile(fileInfo.name)) return false;
  if (!prev || prev.mtime !== fileInfo.mtime) return false;
  if (FLAGS.rechunk && prev.schemaVersion !== CHUNK_SCHEMA_VERSION) return false;
  const cachePath = rawChunkPath(fileInfo.name);
  if (!fs.existsSync(cachePath)) return false;
  const cached = loadJSON(cachePath);
  return !!(cached && Array.isArray(cached.chunks) && cached.chunks.length > 0);
}

function countChangedFiles(uniqueFiles, oldState) {
  let unchanged = 0;
  let changed = 0;
  for (const fileInfo of uniqueFiles) {
    if (isStage1CacheFresh(fileInfo, oldState[fileInfo.name])) unchanged++;
    else changed++;
  }
  return { unchanged, changed };
}

function loadExistingFilteredBySource() {
  const bySource = new Map();
  if (!fs.existsSync(DATA_DIR)) return bySource;
  for (const catFile of fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("index_") && f.endsWith(".json"))) {
    const existing = loadJSON(path.join(DATA_DIR, catFile), []);
    for (const chunk of existing) {
      const source = chunk.metadata?.source;
      if (!source) continue;
      if (!bySource.has(source)) bySource.set(source, []);
      bySource.get(source).push(chunk);
    }
  }
  return bySource;
}

// ─── Embedding API ────────────────────────────────────────────────────────────

function getEmbeddingsUrl() {
  const full = process.env.RAG_EMBEDDINGS_URL?.trim();
  if (full) return full;
  const base = (process.env.RAG_EMBEDDING_API_BASE || "").trim();
  return base ? `${base.replace(/\/$/, "")}/embeddings` : "";
}

function getEmbeddingModel() {
  return process.env.RAG_EMBEDDING_MODEL?.trim() || "";
}

const EMBED_BATCH = 10; // Zhipu 免费版不宜太大，避免触发 429

async function getEmbeddingsBatch(texts) {
  if (!API_KEY || texts.length === 0) return { embeddings: texts.map(() => null), error: null };
  try {
    const response = await fetch(getEmbeddingsUrl(), {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ model: getEmbeddingModel(), input: texts.map(t => String(t).replace(/\n/g, " ").slice(0, 512)) }),
    });
    if (!response.ok) {
      return { embeddings: texts.map(() => null), error: { status: response.status, body: (await response.text()).slice(0, 200) } };
    }
    const result = await response.json();
    if (!Array.isArray(result.data)) return { embeddings: texts.map(() => null), error: { status: 0, body: "bad response" } };
    const embMap = new Map();
    for (const item of result.data) {
      if (item && typeof item.index === "number" && Array.isArray(item.embedding)) embMap.set(item.index, item.embedding);
    }
    return { embeddings: texts.map((_, i) => embMap.get(i) ?? null), error: null };
  } catch (err) {
    return { embeddings: texts.map(() => null), error: { status: 0, body: err instanceof Error ? err.message : String(err) } };
  }
}

// ─── Garbled text filter ──────────────────────────────────────────────────────

function isLikelyGarbled(text) {
  if (!text || text.length < 10) return false;
  const fullwidthChars = text.match(/[！-～]/g);
  if (fullwidthChars && fullwidthChars.length > text.length * 0.3) return true;
  if (text.match(/(?:\b[a-zA-Z]\s){5,}[a-zA-Z]\b/)) return true;
  if (text.match(/(?:[Ａ-Ｚａ-ｚ]\s){4,}[Ａ-Ｚａ-ｚ]/)) return true;
  const stripped = text.replace(/[\s\d.,;:()\[\]{}+%=°℃μ±×→←↑↓√∞αβγδελρσ×•·…\-–—/\\@#$%^&*_=+<>|~`'"!?]/g, "");
  if (stripped.length < text.length * 0.15) return true;
  return false;
}

// ─── Stage 1: PDF → Chunks ────────────────────────────────────────────────────

async function stage1_parsePDFs(uniqueFiles) {
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  const articlesResolved = path.resolve(ARTICLES_DIR);
  const oldState = loadJSON(STAGE1_STATE, {});

  let parsed = 0, skipped = 0;
  const allRawChunks = [];
  const total = uniqueFiles.length;
  let fileIndex = 0;

  for (const fileInfo of uniqueFiles) {
    fileIndex += 1;
    const prev = oldState[fileInfo.name];
    const cachePath = rawChunkPath(fileInfo.name);

    if (isStage1CacheFresh(fileInfo, prev)) {
      const cached = loadJSON(cachePath);
      if (cached && Array.isArray(cached.chunks) && cached.chunks.length > 0) {
        allRawChunks.push({
          filename: fileInfo.name,
          chunks: cached.chunks,
          docMeta: cached.docMeta,
          category: fileInfo.category,
          fromCache: true,
        });
        skipped++;
        emitProgress({
          type: "file",
          status: "unchanged",
          name: fileInfo.name,
          index: fileIndex,
          total,
          chunkCount: cached.chunks.length,
        });
        if (FLAGS.verbose) console.log(`  [stage1:skip] ${fileInfo.name}`);
        continue;
      }
    }

    emitProgress({ type: "file", status: "processing", name: fileInfo.name, index: fileIndex, total });
    if (FLAGS.verbose) console.log(`  [stage1:parse] ${fileInfo.name}`);

    try {
      const dataBuffer = new Uint8Array(fs.readFileSync(fileInfo.path));
      const pdfDocument = await pdfjs.getDocument({ data: dataBuffer, verbosity: 0 }).promise;

      const chunks = [];
      let chunkIdx = 0;
      let headerText = "";
      let headerLines = [];
      let skippedPages = 0;
      let currentSection = null;
      const relPath = path.relative(articlesResolved, fileInfo.path).split(path.sep).join("/");
      const headerPageLimit = Math.min(3, pdfDocument.numPages);

      for (let pg = 1; pg <= pdfDocument.numPages; pg++) {
        const page = await pdfDocument.getPage(pg);
        const textContent = await page.getTextContent();
        const pageText = extractPageText(textContent);
        if (pg <= headerPageLimit) {
          headerText += (headerText ? "\n" : "") + pageText;
          headerLines.push(...groupTextContentLines(textContent));
        }
        if (!isPageTextUsable(pageText)) {
          skippedPages++;
          continue;
        }
        if (isLikelyReferencesText(pageText, { page: pg, minPage: 3 })) {
          skippedPages++;
          if (FLAGS.verbose) console.log(`  [stage1:skip-refs] ${fileInfo.name} p.${pg}`);
          continue;
        }

        const lines = groupTextContentLines(textContent);
        let segs = segmentLinesBySection(lines, currentSection);
        if (segs.length === 0 && pageText) {
          segs = [{ section: currentSection, text: pageText }];
        }
        if (segs.length > 0) {
          currentSection = segs[segs.length - 1].section;
        }

        for (const seg of segs) {
          const subChunks = await splitter.splitText(seg.text);
          const secKey = seg.section || "u";
          for (let i = 0; i < subChunks.length; i++) {
            const content = subChunks[i].trim();
            if (content.length < 15) continue;
            chunks.push({
              content,
              metadata: {
                source: fileInfo.name,
                category: fileInfo.category,
                id: `${relPath}#${secKey}#p${pg}c${i}`,
                pageStart: pg, pageEnd: pg, chunkIndex: chunkIdx,
                ...(seg.section ? { section: seg.section } : {}),
              },
            });
            chunkIdx++;
          }
        }
      }

      const docMeta = await extractDocMetadata(pdfDocument, fileInfo.name, headerText.slice(0, 10000), {
        headerLines: headerLines.slice(0, 120),
      });
      if (chunks.length === 0) {
        docMeta.parseWarning = skippedPages >= pdfDocument.numPages ? "no_text" : "low_text";
      }

      saveJSON(cachePath, { chunks, docMeta, mtime: fileInfo.mtime, schemaVersion: CHUNK_SCHEMA_VERSION });

      oldState[fileInfo.name] = { mtime: fileInfo.mtime, schemaVersion: CHUNK_SCHEMA_VERSION };
      allRawChunks.push({ filename: fileInfo.name, chunks, docMeta, category: fileInfo.category, fromCache: false });
      parsed++;
      emitProgress({
        type: "file",
        status: "done",
        name: fileInfo.name,
        index: fileIndex,
        total,
        chunkCount: chunks.length,
        documentType: docMeta?.documentType,
        message: docMeta.parseWarning === "no_text" ? "未提取到可索引文本（可能为扫描版 PDF）" : undefined,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`  [stage1:error] ${fileInfo.name}:`, message);
      emitProgress({ type: "file", status: "error", name: fileInfo.name, index: fileIndex, total, message });
    }
  }

  // 全量扫描才清孤儿缓存；增量 --files 不得把其它文献的 raw cache / state 删掉
  const validNames = new Set(uniqueFiles.map((f) => f.name));
  const { state: nextState, removed } = pruneStage1Orphans(oldState, validNames, {
    isPartial: isPartialReindex(),
  });
  for (const name of removed) {
    const cachePath = rawChunkPath(name);
    if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
  }

  saveJSON(STAGE1_STATE, nextState);
  console.log(`Stage 1 done: ${parsed} parsed, ${skipped} reused from cache`);
  return allRawChunks;
}

// ─── Stage 2: Filter + Write ──────────────────────────────────────────────────

async function loadExistingMetaByNameFromPrisma(names = null) {
  const map = new Map();
  try {
    const { PrismaClient } = await import("@prisma/client");
    const prisma = new PrismaClient();
    try {
      const files = names?.length
        ? await prisma.knowledgeFile.findMany({ where: { name: { in: names } } })
        : await prisma.knowledgeFile.findMany();
      for (const f of files) {
        let bib = null;
        if (f.bib) {
          try {
            bib = JSON.parse(f.bib);
          } catch {
            bib = null;
          }
        }
        map.set(f.name, {
          name: f.name,
          category: f.category,
          documentType: f.documentType,
          chunkCount: f.chunkCount ?? 0,
          size: f.size,
          mtime: f.mtime ? new Date(f.mtime).toISOString() : "",
          bib,
          gbTag: f.gbTag,
          parseWarning: f.parseWarning,
          bibEdited: !!f.bibEdited,
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  } catch (err) {
    console.warn("  Prisma 元数据加载失败，回退 metadata.json:", err.message);
  }
  if (map.size === 0 && fs.existsSync(METADATA_PATH)) {
    for (const m of loadJSON(METADATA_PATH, [])) {
      if (m?.name) map.set(m.name, m);
    }
  }
  return map;
}

function syncMetadataToPrisma(metadataRecords) {
  const tmpMeta = path.join(DATA_DIR, ".metadata-prisma-sync.json");
  saveJSON(tmpMeta, metadataRecords);
  try {
    execSync(
      `node "${path.join(__dirname, "sync-knowledge-metadata-to-prisma.mjs")}" "${tmpMeta}"`,
      { cwd: projectRoot, stdio: "inherit" },
    );
  } finally {
    if (fs.existsSync(tmpMeta)) fs.unlinkSync(tmpMeta);
  }
}

function resolveFileSize(filename, sizeByName, prev, existingMetaByName) {
  const fromScan = sizeByName?.get(filename);
  if (typeof fromScan === "number" && fromScan > 0) return fromScan;
  if (typeof prev?.size === "number" && prev.size > 0) return prev.size;
  const fromExisting = existingMetaByName.get(filename)?.size;
  if (typeof fromExisting === "number" && fromExisting > 0) return fromExisting;
  return 0;
}

function buildFileMetadata(filename, category, chunkCount, docMeta, existingMetaByName, sizeByName, parseWarning) {
  const prev = existingMetaByName.get(filename);
  return {
    name: filename,
    category,
    chunkCount,
    size: resolveFileSize(filename, sizeByName, prev, existingMetaByName),
    mtime: new Date().toISOString(),
    documentType: (() => {
      if (prev?.bibEdited && prev?.documentType) return prev.documentType;
      return docMeta?.documentType || prev?.documentType || null;
    })(),
    gbTag: (() => {
      if (prev?.bibEdited && prev?.gbTag) return prev.gbTag;
      return docMeta?.gbTag || prev?.gbTag || null;
    })(),
    bib: (() => {
      if (prev?.bibEdited && prev?.bib && Object.keys(prev.bib).length > 0) return prev.bib;
      const autoBib = (docMeta?.bib && Object.keys(docMeta.bib).length > 0) ? docMeta.bib : null;
      return autoBib || prev?.bib || null;
    })(),
    bibEdited: !!prev?.bibEdited,
    parseWarning: parseWarning ?? prev?.parseWarning ?? null,
  };
}

function stage2_filterAndWrite(allRawChunks, existingMetaByName, sizeByName = new Map()) {
  emitProgress({ type: "phase", phase: "writing", detail: "过滤文本并合并分类索引…" });
  const ABSTRACT_ONLY_CATEGORY = "外部摘要";
  const skipEmbRewrite = true; // Stage 2 不造向量；Stage 3 再追加
  const modelChanged = !FLAGS.skipStage3 && !FLAGS.stage2Only && !!API_KEY && (() => {
    const prev = loadJSON(EMBED_STATE, {});
    return Boolean(prev.model) && prev.model !== getEmbeddingModel();
  })();
  if (modelChanged) {
    console.log("  Embedding model changed — will rewrite affected category indexes");
  }
  const categoryMap = new Map();
  const dropSources = new Set();
  const metadata = [];
  const changedChunks = [];
  let totalBefore = 0;
  let totalAfter = 0;
  let reusedFiles = 0;
  let changedFiles = 0;

  for (const { filename, chunks, docMeta, category, fromCache } of allRawChunks) {
    const prev = existingMetaByName.get(filename);
    const alreadyIndexed = (prev?.chunkCount ?? 0) > 0;
    const unchanged =
      fromCache
      && alreadyIndexed
      && !shouldForceStage3ForFile(filename)
      && !shouldForceStage1ForFile(filename)
      && !FLAGS.stage2Only
      && !modelChanged;

    if (unchanged) {
      reusedFiles++;
      continue;
    }

    changedFiles++;
    dropSources.add(filename);
    totalBefore += chunks.length;
    const filtered = [];
    for (const c of chunks) {
      if (isLikelyGarbled(c.content)) continue;
      if (isLikelyReferencesText(c.content, { page: c.metadata?.pageStart, minPage: 3 })) continue;
      filtered.push({
        content: c.content,
        metadata: {
          ...c.metadata,
          source: filename,
          category,
          documentType: docMeta?.documentType || null,
        },
      });
    }
    totalAfter += filtered.length;
    changedChunks.push(...filtered);

    const cat = category || "未分类";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat).push(...filtered);

    metadata.push(buildFileMetadata(
      filename,
      category,
      filtered.length,
      docMeta,
      existingMetaByName,
      sizeByName,
      filtered.length === 0 ? (docMeta?.parseWarning || "no_text") : null,
    ));
  }

  const filteredOut = totalBefore - totalAfter;
  console.log(`Stage 2 done: ${changedFiles} changed files, ${totalBefore} → ${totalAfter} chunks (${filteredOut} garbled filtered, ${reusedFiles} unchanged skipped, ${categoryMap.size} categories to write)`);

  if (categoryMap.size === 0) {
    emitProgress({ type: "phase", phase: "writing", detail: "无变更，跳过索引写出" });
    return { allChunks: [], metadata, categoryCount: 0, reusedFiles, changedSources: dropSources };
  }

  emitProgress({ type: "phase", phase: "writing", detail: `增量写入 ${categoryMap.size} 个分类索引` });

  const staleCats = new Set();
  for (const name of dropSources) {
    const prevCat = existingMetaByName.get(name)?.category;
    const item = allRawChunks.find((x) => x.filename === name);
    const newCat = item?.category || "未分类";
    if (prevCat && prevCat !== newCat) staleCats.add(prevCat);
  }

  for (const [cat, newChunks] of categoryMap) {
    const indexPath = path.join(DATA_DIR, `index_${cat}.json`);
    const previousChunks = loadJSON(indexPath, []);
    const merged = mergeCategoryChunks(previousChunks, newChunks, dropSources);
    const { chunkCount, hasEmb, jsonPath, action } = writeCategoryIndex(cat, merged, {
      previousChunks,
      skipEmbRewrite,
    });
    emitProgress({ type: "save", phase: "category", category: cat, chunkCount });
    const mb = (fs.statSync(jsonPath).size / 1024 / 1024).toFixed(1);
    const embNote = hasEmb ? ` + .emb (${action})` : ` (${action})`;
    console.log(`  index_${cat}.json: ${chunkCount} chunks (${mb} MB)${embNote}`);
  }

  for (const cat of staleCats) {
    if (categoryMap.has(cat)) continue;
    const indexPath = path.join(DATA_DIR, `index_${cat}.json`);
    if (!fs.existsSync(indexPath)) continue;
    const previousChunks = loadJSON(indexPath, []);
    const filtered = previousChunks.filter((c) => !dropSources.has(c.metadata?.source));
    if (filtered.length === previousChunks.length) continue;
    const { chunkCount, action } = writeCategoryIndex(cat, filtered, {
      previousChunks,
      skipEmbRewrite: false,
    });
    console.log(`  stripped moved sources from index_${cat}.json → ${chunkCount} chunks (${action})`);
  }

  if (!isPartialReindex()) {
    const scannedCats = new Set(allRawChunks.map((x) => x.category || "未分类"));
    scannedCats.add(ABSTRACT_ONLY_CATEGORY);
    for (const catFile of fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("index_") && f.endsWith(".json"))) {
      const cat = catFile.slice("index_".length, -".json".length);
      if (scannedCats.has(cat) || categoryMap.has(cat)) continue;
      fs.unlinkSync(path.join(DATA_DIR, catFile));
      const embPath = path.join(DATA_DIR, `index_${cat}.emb`);
      if (fs.existsSync(embPath)) fs.unlinkSync(embPath);
      console.log(`  removed orphan index_${cat}.json`);
    }
  }

  emitProgress({ type: "phase", phase: "sync", detail: `同步 ${metadata.length} 篇书目到数据库` });
  syncMetadataToPrisma(metadata);
  console.log(`Metadata → Prisma: ${metadata.length} files (changed only)`);

  return {
    allChunks: changedChunks,
    metadata,
    categoryCount: categoryMap.size,
    reusedFiles,
    changedSources: dropSources,
  };
}

// ─── Stage 3: Embedding ───────────────────────────────────────────────────────

async function stage3_embed(allChunks) {
  if (FLAGS.skipStage3 || !API_KEY) {
    console.log(`Stage 3 skipped (${FLAGS.skipStage3 ? "--skip-stage3" : "no API key"}) — BM25 only`);
    return;
  }

  const embedModel = getEmbeddingModel();
  const oldEmbedState = loadJSON(EMBED_STATE, {});
  const modelChanged = !FLAGS.forceStage3 && oldEmbedState.model !== embedModel;

  if (modelChanged) {
    console.log(`Embedding model changed (${oldEmbedState.model} → ${embedModel}), re-embedding all chunks...`);
  }

  // Find chunks needing embedding
  const needsEmbed = [];
  for (const c of allChunks) {
    const source = c.metadata?.source;
    if (isPartialReindex() && source && !FLAGS.fileFilter.has(source)) continue;
    const hasVec = Array.isArray(c.embedding) && c.embedding.length > 0;
    if (FLAGS.forceStage3 || modelChanged || !hasVec) {
      needsEmbed.push(c);
    }
  }

  if (needsEmbed.length === 0) {
    console.log("Stage 3: all chunks already have embeddings — nothing to do");
    emitProgress({ type: "phase", phase: "embed_skip", detail: "全部 chunk 已有向量，跳过向量化" });
    return;
  }

  console.log(`Stage 3: embedding ${needsEmbed.length} chunks (${allChunks.length} total)`);
  const totalBatches = Math.ceil(needsEmbed.length / EMBED_BATCH);
  emitProgress({ type: "embed", current: 0, total: totalBatches, chunkCount: needsEmbed.length });
  let embeddingApiDead = false;
  let embeddedCount = 0;

  for (let i = 0; i < needsEmbed.length; i += EMBED_BATCH) {
    if (embeddingApiDead) break;
    const batch = needsEmbed.slice(i, i + EMBED_BATCH);
    const batchNum = Math.floor(i / EMBED_BATCH) + 1;
    process.stdout.write(`  batch ${batchNum}/${totalBatches} (${batch.length} chunks)... `);

    let { embeddings, error } = await getEmbeddingsBatch(batch.map(c => c.content));

    // 429 限流 → 等待后重试（最多 3 次）
    for (let retry = 0; retry < 3 && error?.status === 429; retry++) {
      const wait = 2000 * (retry + 1);
      process.stdout.write(`(429, wait ${wait}ms)... `);
      await new Promise(r => setTimeout(r, wait));
      ({ embeddings, error } = await getEmbeddingsBatch(batch.map(c => c.content)));
    }

    if (error && embeddings.every(e => e === null)) {
      embeddingApiDead = true;
      console.warn(`\n⚠ Embedding API dead (${error.status}), stopping. ${embeddedCount}/${needsEmbed.length} embedded.`);
      break;
    }

    for (let j = 0; j < batch.length; j++) {
      if (embeddings[j]) { batch[j].embedding = embeddings[j]; embeddedCount++; }
    }
    emitProgress({ type: "embed", current: batchNum, total: totalBatches, chunkCount: batch.length });
    process.stdout.write(`done (${embeddedCount} total)\n`);

    // 批次间延迟（控制 API 频率）
    if (FLAGS.embedDelay > 0 && i + EMBED_BATCH < needsEmbed.length) {
      await new Promise(r => setTimeout(r, FLAGS.embedDelay));
    }
  }

  // Save embed state
  saveJSON(EMBED_STATE, { model: embedModel, lastEmbedCount: embeddedCount, totalChunks: allChunks.length });
  console.log(`Stage 3 done: ${embeddedCount}/${needsEmbed.length} chunks embedded`);

  // 按 id 把新向量写回对应分类：纯追加则直接 append .emb，否则按 id 重排复制
  const byCat = new Map();
  for (const c of allChunks) {
    if (!Array.isArray(c.embedding) || c.embedding.length === 0) continue;
    const cat = c.metadata.category || "未分类";
    if (!byCat.has(cat)) byCat.set(cat, []);
    byCat.get(cat).push(c);
  }
  for (const [cat, embedded] of byCat) {
    const indexPath = path.join(DATA_DIR, `index_${cat}.json`);
    const existing = loadJSON(indexPath, []);
    const byId = new Map(embedded.map((c) => [c.metadata?.id, c.embedding]));
    const merged = existing.map((c) => {
      const emb = byId.get(c.metadata?.id);
      return emb ? { ...c, embedding: emb } : c;
    });
    const prefix = existing.filter((c) => !byId.has(c.metadata?.id));
    const { chunkCount, action } = writeCategoryIndex(cat, merged, {
      previousChunks: prefix,
      skipEmbRewrite: false,
    });
    console.log(`  index_${cat}: ${action}, ${chunkCount} chunks`);
  }
  console.log("Indexes updated (JSON + .emb, incremental)");
}

// ─── File Scanning ────────────────────────────────────────────────────────────

function scanFiles() {
  const allFiles = [];
  function walkDir(dir, category = "未分类") {
    if (!fs.existsSync(dir)) return;
    for (const item of fs.readdirSync(dir)) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) { walkDir(fullPath, item); }
      else if (item.toLowerCase().endsWith(".pdf")) {
        allFiles.push({ path: fullPath, name: item, category, mtime: stat.mtimeMs, size: stat.size });
      }
    }
  }
  walkDir(ARTICLES_DIR);

  // Deduplicate by basename（KnowledgeFile.name 全局唯一，同名跨分类时仅保留首个）
  const byName = new Map();
  let dupes = 0;
  const crossCatDuplicates = new Map(); // name -> Set<category>
  for (const f of allFiles) {
    const existing = byName.get(f.name);
    if (!existing) {
      byName.set(f.name, f);
    } else {
      dupes++;
      let cats = crossCatDuplicates.get(f.name);
      if (!cats) {
        cats = new Set([existing.category]);
        crossCatDuplicates.set(f.name, cats);
      }
      cats.add(f.category);
    }
  }
  const uniqueFiles = [...byName.values()];
  console.log(`Scan: ${allFiles.length} PDFs, ${uniqueFiles.length} unique (${dupes} dupes skipped)`);
  if (crossCatDuplicates.size > 0) {
    console.warn(`  ⚠ ${crossCatDuplicates.size} 个同名 PDF 分布在多个分类目录，按 basename 去重仅保留首个目录副本，其余不会进索引：`);
    for (const [name, cats] of crossCatDuplicates) {
      console.warn(`    - ${name}: [${[...cats].join(" / ")}] → 保留「${byName.get(name)?.category}」`);
    }
  }
  return { uniqueFiles, duplicatesSkipped: dupes, pathsFound: allFiles.length };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  emitProgress({ type: "started" });
  console.log("=== RAG Index Builder (3-stage incremental) ===\n");

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(RAW_DIR)) fs.mkdirSync(RAW_DIR, { recursive: true });

  const { uniqueFiles, duplicatesSkipped, pathsFound } = scanFiles();
  let filesToProcess = uniqueFiles;

  if (isPartialReindex()) {
    const missing = [...FLAGS.fileFilter].filter((name) => !uniqueFiles.some((f) => f.name === name));
    if (missing.length > 0) {
      const msg = `未找到文献：${missing.join("、")}`;
      console.error(msg);
      emitProgress({ type: "error", message: msg });
      process.exit(1);
    }
    filesToProcess = uniqueFiles.filter((f) => FLAGS.fileFilter.has(f.name));
    console.log(`Partial reindex: ${filesToProcess.map((f) => f.name).join(", ")}`);
  }

  const oldState = loadJSON(STAGE1_STATE, {});
  const { unchanged, changed } = countChangedFiles(filesToProcess, oldState);
  emitProgress({
    type: "scan",
    total: filesToProcess.length,
    unchanged,
    changed,
    duplicatesSkipped: isPartialReindex() ? 0 : duplicatesSkipped,
    pathsFound: isPartialReindex() ? filesToProcess.length : pathsFound,
  });

  let allRawChunks;

  const embedOnly = isPartialReindex() && FLAGS.forceStage3 && !FLAGS.forceStage1;

  if (FLAGS.stage2Only || embedOnly) {
    emitProgress({
      type: "phase",
      phase: "parse",
      detail: embedOnly ? "读取已有切块（不重解析 PDF）…" : "从缓存加载切块…",
    });
    // 仅从缓存或已有索引重建（用于 forceStage3 单篇重嵌向量）
    console.log(embedOnly ? "embed-only: loading chunks for target files..." : "--stage2-only: loading raw chunks from cache...");
    allRawChunks = [];
    const existingFilteredBySource = loadExistingFilteredBySource();
    let missing = 0;
    for (const f of filesToProcess) {
      const cachePath = rawChunkPath(f.name);
      const cached = loadJSON(cachePath);
      if (cached && Array.isArray(cached.chunks)) {
        allRawChunks.push({ filename: f.name, chunks: cached.chunks, docMeta: cached.docMeta, category: f.category, fromCache: true });
      } else if (existingFilteredBySource.has(f.name)) {
        const indexed = existingFilteredBySource.get(f.name);
        allRawChunks.push({
          filename: f.name,
          chunks: indexed.map((c) => ({ content: c.content, metadata: { ...c.metadata } })),
          docMeta: { parseWarning: indexed.length === 0 ? "no_text" : null },
          category: f.category,
          fromCache: false,
        });
      } else {
        missing++;
        if (FLAGS.verbose) console.log(`  [missing cache/index] ${f.name}`);
      }
    }
    if (missing > 0) {
      console.log(`  ${missing} files without cache/index — try force-stage1`);
      if (missing === filesToProcess.length) {
        emitProgress({ type: "error", message: "目标文献无缓存或索引，请先执行「强制重解析」" });
        process.exit(1);
      }
    }
  } else {
    // Stage 1: PDF → Chunks
    console.log("\n── Stage 1: PDF → Chunks ──");
    emitProgress({ type: "phase", phase: "parse", detail: "开始解析 PDF…" });
    allRawChunks = await stage1_parsePDFs(filesToProcess);
  }

  emitProgress({
    type: "phase",
    phase: "pdf_done",
    chunkCount: allRawChunks.reduce((sum, item) => sum + item.chunks.length, 0),
  });

  console.log("\n── Stage 2: Filter + Write ──");
  const existingMetaByName = await loadExistingMetaByNameFromPrisma(
    isPartialReindex() ? filesToProcess.map((f) => f.name) : null,
  );
  const sizeByName = new Map(filesToProcess.map((f) => [f.name, f.size ?? 0]));
  const { allChunks, categoryCount, reusedFiles } = stage2_filterAndWrite(allRawChunks, existingMetaByName, sizeByName);
  if (reusedFiles > 0) {
    console.log(`  Incremental: reused filtered chunks for ${reusedFiles} unchanged files`);
  }

  const shouldEnrichMetrics =
    process.env.ENRICH_OPENALEX_AFTER_INDEX === "true" || process.argv.includes("--enrich-metrics");
  if (shouldEnrichMetrics && filesToProcess.length > 0) {
    console.log("\n── OpenAlex metrics (post-index) ──");
    try {
      const { enrichKnowledgeFilesByNames } = await import("./lib/openalex-post-index.mjs");
      const n = await enrichKnowledgeFilesByNames(
        filesToProcess.map((f) => f.name),
        { limit: Math.min(filesToProcess.length, 20) },
      );
      console.log(`  OpenAlex enrichment updated ${n} files`);
    } catch (err) {
      console.warn("  OpenAlex enrichment skipped:", err instanceof Error ? err.message : err);
    }
  }

  const doStage3 = !FLAGS.stage2Only && !FLAGS.skipStage3;
  if (doStage3) {
    if (!API_KEY) {
      emitProgress({ type: "phase", phase: "embed_skip", detail: "未配置 Embedding API Key，仅 BM25 检索" });
    }
    console.log("\n── Stage 3: Embedding ──");
    await stage3_embed(allChunks);
  } else {
    console.log("\n── Stage 3: Skipped ──");
    emitProgress({ type: "phase", phase: "embed_skip", detail: FLAGS.stage2Only ? "stage2-only 模式跳过向量化" : "已跳过向量化" });
  }

  console.log("\n=== Done ===");
  emitProgress({
    type: "complete",
    totalChunks: allChunks.length,
    fileCount: filesToProcess.length,
    categoryCount,
    duplicatesSkipped: isPartialReindex() ? 0 : duplicatesSkipped,
  });
}

main().catch((err) => {
  console.error(err);
  emitProgress({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
