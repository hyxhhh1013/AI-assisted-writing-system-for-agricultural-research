/**
 * RAG 索引构建 — 三阶段增量架构
 *
 *   阶段 1: PDF → Chunks  →  缓存到 data/chunks_raw/<hash>.json
 *   阶段 2: Chunk 过滤    →  写 data/index_*.json（无 embedding）+ index_*.emb + metadata.json
 *   阶段 3: Embedding     →  仅对新/无向量的 chunk 调 API
 *
 * 使用：
 *   node scripts/index-pdfs.mjs                  完整构建（增量）
 *   node scripts/index-pdfs.mjs --force-stage1   强制重解析所有 PDF
 *   node scripts/index-pdfs.mjs --force-stage3   强制重算所有 embedding
 *   node scripts/index-pdfs.mjs --skip-stage3    跳过 embedding（仅 BM25）
 *   node scripts/index-pdfs.mjs --stage2-only    仅运行过滤+写出（最快，改过滤规则后使用）
 *   node scripts/index-pdfs.mjs --files=a.pdf,b.pdf  仅处理指定文献（可配合 force-stage1/3）
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { fileURLToPath } from "url";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from "dotenv";
import { extractDocMetadata } from "./doc-type-registry.mjs";

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

// ─── 分离格式：轻量 JSON + float32 .emb（与 convert-index-to-binary.mjs 一致）──

const EMB_HEADER_SIZE = 8;

function writeFloat32LE(arr) {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) buf.writeFloatLE(arr[i], i * 4);
  return buf;
}

function readFloat32LE(buf, offset, count) {
  const out = new Array(count);
  for (let i = 0; i < count; i++) out[i] = buf.readFloatLE(offset + i * 4);
  return out;
}

function writeEmbeddingFile(filePath, embeddings, dim) {
  const header = Buffer.alloc(EMB_HEADER_SIZE);
  header.writeUInt32LE(1, 0);
  header.writeUInt32LE(dim, 4);
  const parts = [header];
  for (const emb of embeddings) {
    if (!emb || emb.length !== dim) {
      parts.push(writeFloat32LE(new Array(dim).fill(0)));
    } else {
      parts.push(writeFloat32LE(emb));
    }
  }
  fs.writeFileSync(filePath, Buffer.concat(parts));
}

function stripEmbeddingsFromChunks(chunks) {
  const embeddings = [];
  let dim = 0;
  const stripped = chunks.map((c) => {
    const emb = Array.isArray(c.embedding) && c.embedding.length > 0 ? c.embedding : null;
    embeddings.push(emb);
    if (emb && dim === 0) dim = emb.length;
    const { embedding: _e, ...rest } = c;
    return rest;
  });
  return { stripped, embeddings, dim };
}

function writeCategoryIndex(cat, chunks) {
  const indexPath = path.join(DATA_DIR, `index_${cat}.json`);
  const embPath = path.join(DATA_DIR, `index_${cat}.emb`);
  const { stripped, embeddings, dim } = stripEmbeddingsFromChunks(chunks);
  saveJSON(indexPath, stripped);
  const hasEmb = dim > 0 && embeddings.some((e) => e && e.length === dim);
  if (hasEmb) {
    writeEmbeddingFile(embPath, embeddings, dim);
  } else if (fs.existsSync(embPath)) {
    fs.unlinkSync(embPath);
  }
  return { jsonPath: indexPath, embPath, chunkCount: stripped.length, hasEmb };
}

function loadExistingEmbMap() {
  const map = new Map();
  if (!fs.existsSync(DATA_DIR)) return map;
  for (const catFile of fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("index_") && f.endsWith(".json"))) {
    const cat = catFile.slice("index_".length, -".json".length);
    const chunks = loadJSON(path.join(DATA_DIR, catFile), []);
    const embPath = path.join(DATA_DIR, `index_${cat}.emb`);
    let buf = null;
    let dim = 0;
    let embCount = 0;
    if (fs.existsSync(embPath)) {
      buf = fs.readFileSync(embPath);
      if (buf.length >= EMB_HEADER_SIZE) {
        dim = buf.readUInt32LE(4);
        embCount = Math.floor((buf.length - EMB_HEADER_SIZE) / (dim * 4));
      }
    }
    for (let i = 0; i < chunks.length; i++) {
      const id = chunks[i].metadata?.id;
      if (!id) continue;
      if (Array.isArray(chunks[i].embedding) && chunks[i].embedding.length > 0) {
        map.set(id, chunks[i].embedding);
      } else if (buf && dim > 0 && i < embCount) {
        map.set(id, readFloat32LE(buf, EMB_HEADER_SIZE + i * dim * 4, dim));
      }
    }
  }
  return map;
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

function countChangedFiles(uniqueFiles, oldState) {
  let unchanged = 0;
  let changed = 0;
  for (const fileInfo of uniqueFiles) {
    const prev = oldState[fileInfo.name];
    const cachePath = rawChunkPath(fileInfo.name);
    const cacheHit =
      !shouldForceStage1ForFile(fileInfo.name)
      && prev
      && prev.mtime === fileInfo.mtime
      && fs.existsSync(cachePath)
      && Array.isArray(loadJSON(cachePath)?.chunks)
      && loadJSON(cachePath).chunks.length > 0;
    if (cacheHit) unchanged++;
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

    if (!shouldForceStage1ForFile(fileInfo.name) && prev && prev.mtime === fileInfo.mtime && fs.existsSync(cachePath)) {
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
      let firstPageText = "";
      let skippedPages = 0;
      const relPath = path.relative(articlesResolved, fileInfo.path).split(path.sep).join("/");

      for (let pg = 1; pg <= pdfDocument.numPages; pg++) {
        const page = await pdfDocument.getPage(pg);
        const textContent = await page.getTextContent();
        const pageText = extractPageText(textContent);
        if (pg === 1) firstPageText = pageText.slice(0, 3000);
        if (!isPageTextUsable(pageText)) {
          skippedPages++;
          continue;
        }

        const subChunks = await splitter.splitText(pageText);
        for (let i = 0; i < subChunks.length; i++) {
          const content = subChunks[i].trim();
          if (content.length < 15) continue;
          chunks.push({
            content,
            metadata: {
              source: fileInfo.name,
              category: fileInfo.category,
              id: `${relPath}#p${pg}c${i}`,
              pageStart: pg, pageEnd: pg, chunkIndex: chunkIdx,
            },
          });
          chunkIdx++;
        }
      }

      const docMeta = await extractDocMetadata(pdfDocument, fileInfo.name, firstPageText);
      if (chunks.length === 0) {
        docMeta.parseWarning = skippedPages >= pdfDocument.numPages ? "no_text" : "low_text";
      }

      saveJSON(cachePath, { chunks, docMeta, mtime: fileInfo.mtime });

      oldState[fileInfo.name] = { mtime: fileInfo.mtime };
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

  // 清理孤儿缓存（文件已不存在的缓存）
  const validNames = new Set(uniqueFiles.map(f => f.name));
  for (const name of Object.keys(oldState)) {
    if (!validNames.has(name)) {
      const cachePath = rawChunkPath(name);
      if (fs.existsSync(cachePath)) fs.unlinkSync(cachePath);
      delete oldState[name];
    }
  }

  saveJSON(STAGE1_STATE, oldState);
  console.log(`Stage 1 done: ${parsed} parsed, ${skipped} reused from cache`);
  return allRawChunks;
}

// ─── Stage 2: Filter + Write ──────────────────────────────────────────────────

function mergeCategoryChunks(cat, newChunks) {
  const indexPath = path.join(DATA_DIR, `index_${cat}.json`);
  if (!isPartialReindex()) return newChunks;
  const existing = loadJSON(indexPath, []);
  const kept = existing.filter((c) => !FLAGS.fileFilter.has(c.metadata?.source));
  return [...kept, ...newChunks];
}

function stage2_filterAndWrite(allRawChunks) {
  const existingEmbMap = loadExistingEmbMap();
  if (existingEmbMap.size > 0) console.log(`  Preserved ${existingEmbMap.size} existing embeddings`);

  const existingMeta = fs.existsSync(METADATA_PATH) ? loadJSON(METADATA_PATH, []) : [];
  const existingMetaByName = new Map(existingMeta.map((m) => [m.name, m]));
  const existingFilteredBySource = loadExistingFilteredBySource();

  const allChunks = [];
  const metadata = [];
  const categoryMap = new Map();

  let totalBefore = 0, totalAfter = 0, reusedFiles = 0;

  for (const { filename, chunks, docMeta, category, fromCache } of allRawChunks) {
    const prev = existingMetaByName.get(filename);
    const canReuseFiltered =
      fromCache
      && existingFilteredBySource.has(filename)
      && !shouldForceStage3ForFile(filename)
      && !shouldForceStage1ForFile(filename);

    if (canReuseFiltered) {
      const reused = existingFilteredBySource.get(filename).map((chunk) => {
        const id = chunk.metadata?.id;
        const preservedEmb = id ? existingEmbMap.get(id) : null;
        return {
          ...chunk,
          embedding: preservedEmb || chunk.embedding || undefined,
          metadata: {
            ...chunk.metadata,
            source: filename,
            category,
            documentType: (() => {
              if (prev?.bibEdited && prev?.documentType) return prev.documentType;
              return docMeta?.documentType || chunk.metadata?.documentType || null;
            })(),
          },
        };
      });

      totalAfter += reused.length;
      allChunks.push(...reused);

      const cat = category || "未分类";
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat).push(...reused);

      metadata.push({
        name: filename,
        category,
        chunkCount: reused.length,
        size: prev?.size || 0,
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
        parseWarning: docMeta?.parseWarning || prev?.parseWarning || null,
      });
      reusedFiles++;
      continue;
    }

    totalBefore += chunks.length;
    const filtered = [];

    for (const c of chunks) {
      if (isLikelyGarbled(c.content)) continue;
      const savedEmb = shouldForceStage3ForFile(filename)
        ? null
        : (existingEmbMap.get(c.metadata?.id) || null);
      filtered.push({
        content: c.content,
        embedding: savedEmb,
        metadata: {
          ...c.metadata,
          source: filename,
          category,
          documentType: docMeta?.documentType || null,
        },
      });
    }
    totalAfter += filtered.length;

    allChunks.push(...filtered);

    const cat = category || "未分类";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat).push(...filtered);

    metadata.push({
      name: filename,
      category,
      chunkCount: filtered.length,
      size: existingMetaByName.get(filename)?.size || 0,
      mtime: new Date().toISOString(),
      documentType: (() => {
        const prevEntry = existingMetaByName.get(filename);
        if (prevEntry?.bibEdited && prevEntry?.documentType) return prevEntry.documentType;
        return docMeta?.documentType || prevEntry?.documentType || null;
      })(),
      gbTag: (() => {
        const prevEntry = existingMetaByName.get(filename);
        if (prevEntry?.bibEdited && prevEntry?.gbTag) return prevEntry.gbTag;
        return docMeta?.gbTag || prevEntry?.gbTag || null;
      })(),
      bib: (() => {
        const prevEntry = existingMetaByName.get(filename);
        if (prevEntry?.bibEdited && prevEntry?.bib && Object.keys(prevEntry.bib).length > 0) {
          return prevEntry.bib;
        }
        const autoBib = (docMeta?.bib && Object.keys(docMeta.bib).length > 0) ? docMeta.bib : null;
        return autoBib || prevEntry?.bib || null;
      })(),
      bibEdited: !!existingMetaByName.get(filename)?.bibEdited,
      parseWarning: filtered.length === 0 ? (docMeta?.parseWarning || "no_text") : null,
    });
  }

  const filteredOut = totalBefore - totalAfter;
  console.log(`Stage 2 done: ${totalBefore} → ${totalAfter} chunks (${filteredOut} garbled filtered, ${reusedFiles} files reused, ${categoryMap.size} categories)`);

  emitProgress({ type: "phase", phase: "writing", detail: `写入 ${categoryMap.size} 个分类索引` });

  const activeCategories = new Set(categoryMap.keys());
  for (const [cat, chunks] of categoryMap) {
    const merged = mergeCategoryChunks(cat, chunks);
    const { stripped, hasEmb } = writeCategoryIndex(cat, merged);
    emitProgress({ type: "save", phase: "category", category: cat, chunkCount: stripped.length });
    const mb = (Buffer.byteLength(JSON.stringify(stripped)) / 1024 / 1024).toFixed(1);
    const embNote = hasEmb ? " + .emb" : "";
    console.log(`  index_${cat}.json: ${stripped.length} chunks (${mb} MB)${embNote}`);
  }

  if (!isPartialReindex()) {
    for (const catFile of fs.readdirSync(DATA_DIR).filter((f) => f.startsWith("index_") && f.endsWith(".json"))) {
      const cat = catFile.slice("index_".length, -".json".length);
      if (!activeCategories.has(cat)) {
        fs.unlinkSync(path.join(DATA_DIR, catFile));
        const embPath = path.join(DATA_DIR, `index_${cat}.emb`);
        if (fs.existsSync(embPath)) fs.unlinkSync(embPath);
        console.log(`  removed orphan index_${cat}.json`);
      }
    }
  }

  let metadataDeduped;
  if (isPartialReindex()) {
    const existingMeta = loadJSON(METADATA_PATH, []);
    const byName = new Map(existingMeta.map((m) => [m.name, m]));
    for (const m of metadata) byName.set(m.name, m);
    metadataDeduped = [...byName.values()];
  } else {
    metadataDeduped = [...new Map(metadata.map((m) => [m.name, m])).values()];
  }
  saveJSON(METADATA_PATH, metadataDeduped);
  console.log(`Metadata: ${metadataDeduped.length} files`);

  const mergedAllChunks = isPartialReindex()
    ? rebuildAllChunksFromIndexes(activeCategories)
    : allChunks;

  return { allChunks: mergedAllChunks, metadata: metadataDeduped, categoryCount: categoryMap.size, reusedFiles };
}

function rebuildAllChunksFromIndexes(activeCategories) {
  const chunks = [];
  for (const cat of activeCategories) {
    const merged = loadJSON(path.join(DATA_DIR, `index_${cat}.json`), []);
    chunks.push(...merged);
  }
  return chunks;
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

  // Re-write indexes with embeddings
  const categoryMap = new Map();
  for (const c of allChunks) {
    const cat = c.metadata.category || "未分类";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat).push(c);
  }
  for (const [cat, chunks] of categoryMap) {
    writeCategoryIndex(cat, chunks);
  }
  console.log("Indexes re-written (JSON + .emb split format)");
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
      else if (item.toLowerCase().endsWith(".pdf")) { allFiles.push({ path: fullPath, name: item, category, mtime: stat.mtimeMs }); }
    }
  }
  walkDir(ARTICLES_DIR);

  // Deduplicate by basename
  const byName = new Map();
  let dupes = 0;
  for (const f of allFiles) {
    if (!byName.has(f.name)) { byName.set(f.name, f); } else { dupes++; }
  }
  const uniqueFiles = [...byName.values()];
  console.log(`Scan: ${allFiles.length} PDFs, ${uniqueFiles.length} unique (${dupes} dupes skipped)`);
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
      emitProgress({ type: "error", message: `未找到文献：${missing.join("、")}` });
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
    allRawChunks = await stage1_parsePDFs(filesToProcess);
  }

  emitProgress({
    type: "phase",
    phase: "pdf_done",
    chunkCount: allRawChunks.reduce((sum, item) => sum + item.chunks.length, 0),
  });

  console.log("\n── Stage 2: Filter + Write ──");
  const { allChunks, categoryCount, reusedFiles } = stage2_filterAndWrite(allRawChunks);
  if (reusedFiles > 0) {
    console.log(`  Incremental: reused filtered chunks for ${reusedFiles} unchanged files`);
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

main().catch(console.error);
