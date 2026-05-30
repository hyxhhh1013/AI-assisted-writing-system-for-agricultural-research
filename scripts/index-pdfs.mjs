/**
 * RAG 索引构建 — 三阶段增量架构
 *
 *   阶段 1: PDF → Chunks  →  缓存到 data/chunks_raw/<hash>.json
 *   阶段 2: Chunk 过滤    →  写 data/index_*.json + data/metadata.json
 *   阶段 3: Embedding     →  仅对新/无向量的 chunk 调 API
 *
 * 使用：
 *   node scripts/index-pdfs.mjs                  完整构建（增量）
 *   node scripts/index-pdfs.mjs --force-stage1   强制重解析所有 PDF
 *   node scripts/index-pdfs.mjs --force-stage3   强制重算所有 embedding
 *   node scripts/index-pdfs.mjs --skip-stage3    跳过 embedding（仅 BM25）
 *   node scripts/index-pdfs.mjs --stage2-only    仅运行过滤+写出（最快，改过滤规则后使用）
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
const FLAGS = {
  forceStage1: process.argv.includes("--force-stage1"),
  forceStage3: process.argv.includes("--force-stage3"),
  skipStage3:  process.argv.includes("--skip-stage3"),
  stage2Only:  process.argv.includes("--stage2-only"),
  progress:    process.argv.includes("--progress"),
  verbose:     process.argv.includes("--verbose"),
  /** 每个 batch 之间的延迟（毫秒），用于控制 API 调用频率 */
  embedDelay:  parseInt(process.argv.find(a => a.startsWith("--embed-delay="))?.split("=")[1] || "0", 10),
};

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
  const allRawChunks = []; // { filename, chunks }

  for (const fileInfo of uniqueFiles) {
    const prev = oldState[fileInfo.name];
    const cachePath = rawChunkPath(fileInfo.name);

    // 增量：mtime 未变 + 缓存存在 → 跳过 PDF 解析
    if (!FLAGS.forceStage1 && prev && prev.mtime === fileInfo.mtime && fs.existsSync(cachePath)) {
      const cached = loadJSON(cachePath);
      if (cached && Array.isArray(cached.chunks) && cached.chunks.length > 0) {
        allRawChunks.push({ filename: fileInfo.name, chunks: cached.chunks, docMeta: cached.docMeta, category: fileInfo.category, fromCache: true });
        skipped++;
        if (FLAGS.verbose) console.log(`  [stage1:skip] ${fileInfo.name}`);
        continue;
      }
    }

    // 解析 PDF
    if (FLAGS.verbose) console.log(`  [stage1:parse] ${fileInfo.name}`);
    emitProgress({ type: "stage1", status: "processing", name: fileInfo.name, parsed, total: uniqueFiles.length });

    try {
      const dataBuffer = new Uint8Array(fs.readFileSync(fileInfo.path));
      const pdfDocument = await pdfjs.getDocument({ data: dataBuffer, verbosity: 0 }).promise;

      const chunks = [];
      let chunkIdx = 0;
      let firstPageText = "";
      const relPath = path.relative(articlesResolved, fileInfo.path).split(path.sep).join("/");

      for (let pg = 1; pg <= pdfDocument.numPages; pg++) {
        const page = await pdfDocument.getPage(pg);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => ("str" in item ? item.str : "")).join(" ").replace(/\s+/g, " ").trim();
        if (pg === 1) firstPageText = pageText.slice(0, 3000);
        if (pageText.length < 30) continue;

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

      // 写入缓存
      saveJSON(cachePath, { chunks, docMeta, mtime: fileInfo.mtime });

      oldState[fileInfo.name] = { mtime: fileInfo.mtime };
      allRawChunks.push({ filename: fileInfo.name, chunks, docMeta, category: fileInfo.category, fromCache: false });
      parsed++;
    } catch (err) {
      console.error(`  [stage1:error] ${fileInfo.name}:`, err instanceof Error ? err.message : err);
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

function stage2_filterAndWrite(allRawChunks) {
  // 加载现有索引中的 embedding（按 chunk id 索引），避免 Stage 2 覆盖时丢失已有向量
  const existingEmbMap = new Map();
  for (const catFile of fs.readdirSync(DATA_DIR).filter(f => f.startsWith("index_") && f.endsWith(".json"))) {
    const existing = loadJSON(path.join(DATA_DIR, catFile), []);
    for (const c of existing) {
      if (Array.isArray(c.embedding) && c.embedding.length > 0 && c.metadata?.id) {
        existingEmbMap.set(c.metadata.id, c.embedding);
      }
    }
  }
  if (existingEmbMap.size > 0) console.log(`  Preserved ${existingEmbMap.size} existing embeddings`);

  const allChunks = [];
  const metadata = [];
  const categoryMap = new Map();

  let totalBefore = 0, totalAfter = 0;

  for (const { filename, chunks, docMeta, category } of allRawChunks) {
    totalBefore += chunks.length;
    const filtered = [];

    for (const c of chunks) {
      if (isLikelyGarbled(c.content)) continue;
      const savedEmb = existingEmbMap.get(c.metadata?.id) || null;
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

    // category grouping
    const cat = category || "未分类";
    if (!categoryMap.has(cat)) categoryMap.set(cat, []);
    categoryMap.get(cat).push(...filtered);

    metadata.push({
      name: filename,
      category,
      chunkCount: filtered.length,
      size: 0,
      mtime: new Date().toISOString(),
      documentType: docMeta?.documentType || null,
      gbTag: docMeta?.gbTag || null,
      bib: (docMeta?.bib && Object.keys(docMeta.bib).length > 0) ? docMeta.bib : null,
    });
  }

  const filteredOut = totalBefore - totalAfter;
  console.log(`Stage 2 done: ${totalBefore} → ${totalAfter} chunks (${filteredOut} garbled filtered, ${categoryMap.size} categories)`);

  // Write split indexes
  for (const [cat, chunks] of categoryMap) {
    saveJSON(path.join(DATA_DIR, `index_${cat}.json`), chunks);
    const mb = (Buffer.byteLength(JSON.stringify(chunks)) / 1024 / 1024).toFixed(1);
    console.log(`  index_${cat}.json: ${chunks.length} chunks (${mb} MB)`);
  }

  // Write metadata
  const metadataDeduped = [...new Map(metadata.map(m => [m.name, m])).values()];
  saveJSON(METADATA_PATH, metadataDeduped);
  console.log(`Metadata: ${metadataDeduped.length} files`);

  return { allChunks, metadata };
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
    const hasVec = Array.isArray(c.embedding) && c.embedding.length > 0;
    if (FLAGS.forceStage3 || modelChanged || !hasVec) {
      needsEmbed.push(c);
    }
  }

  if (needsEmbed.length === 0) {
    console.log("Stage 3: all chunks already have embeddings — nothing to do");
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
    saveJSON(path.join(DATA_DIR, `index_${cat}.json`), chunks);
  }
  console.log("Indexes re-written with embeddings");
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

  const { uniqueFiles, duplicatesSkipped, pathsFound } = scanFiles();

  let allRawChunks;

  if (FLAGS.stage2Only) {
    // 仅从缓存重建过滤+写出（最快路径）
    console.log("--stage2-only: loading raw chunks from cache...");
    allRawChunks = [];
    let missing = 0;
    for (const f of uniqueFiles) {
      const cachePath = rawChunkPath(f.name);
      const cached = loadJSON(cachePath);
      if (cached && Array.isArray(cached.chunks)) {
        allRawChunks.push({ filename: f.name, chunks: cached.chunks, docMeta: cached.docMeta, category: f.category, fromCache: true });
      } else {
        missing++;
        if (FLAGS.verbose) console.log(`  [missing cache] ${f.name}`);
      }
    }
    if (missing > 0) console.log(`  ${missing} files without cache — run without --stage2-only to rebuild`);
  } else {
    // Stage 1: PDF → Chunks
    console.log("\n── Stage 1: PDF → Chunks ──");
    allRawChunks = await stage1_parsePDFs(uniqueFiles);
  }

  // Stage 2: Filter + Write
  console.log("\n── Stage 2: Filter + Write ──");
  const { allChunks } = stage2_filterAndWrite(allRawChunks);

  // Stage 3: Embedding（--stage2-only 默认跳过）
  const doStage3 = !FLAGS.stage2Only && !FLAGS.skipStage3;
  if (doStage3) {
    console.log("\n── Stage 3: Embedding ──");
    await stage3_embed(allChunks);
  } else {
    console.log("\n── Stage 3: Skipped ──");
  }

  console.log("\n=== Done ===");
  emitProgress({ type: "complete", totalChunks: allChunks.length, fileCount: uniqueFiles.length, duplicatesSkipped });
}

main().catch(console.error);
