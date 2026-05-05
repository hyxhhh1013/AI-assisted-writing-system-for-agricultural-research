import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import pdfjs from "pdfjs-dist/legacy/build/pdf.js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env.local") });

const ARTICLES_DIR = path.resolve(
  projectRoot,
  process.env.RAG_ARTICLES_DIR || "热化学小组文章-2024.12.27",
);
const OUTPUT_INDEX = path.join(projectRoot, "data/index.json");
const OUTPUT_METADATA = path.join(projectRoot, "data/metadata.json");
const API_KEY =
  process.env.RAG_EMBEDDING_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();

function getEmbeddingsUrl() {
  const full = process.env.RAG_EMBEDDINGS_URL?.trim();
  if (full) return full;
  const base = (process.env.RAG_EMBEDDING_API_BASE || "https://api.deepseek.com/v1").replace(/\/$/, "");
  return `${base}/embeddings`;
}

function getEmbeddingModel() {
  return process.env.RAG_EMBEDDING_MODEL?.trim() || "deepseek-embed";
}

/** 批量获取 embedding（DeepSeek 原生支持多条 input） */
async function getEmbeddingsBatch(texts) {
  if (!API_KEY || texts.length === 0) return texts.map(() => null);
  try {
    const response = await fetch(getEmbeddingsUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        model: getEmbeddingModel(),
        input: texts.map((t) => String(t).replace(/\n/g, " ").slice(0, 8000)),
      }),
    });
    if (!response.ok) return texts.map(() => null);
    const result = await response.json();
    if (!Array.isArray(result.data)) return texts.map(() => null);
    // API 返回的 data 按 input 顺序排列
    const embMap = new Map();
    for (const item of result.data) {
      if (item && typeof item.index === "number" && Array.isArray(item.embedding)) {
        embMap.set(item.index, item.embedding);
      }
    }
    return texts.map((_, i) => embMap.get(i) ?? null);
  } catch {
    return texts.map(() => null);
  }
}

// ---------- 增量相关 ----------

/** 加载现有 metadata，返回 Map<name, entry> */
function loadExistingMetadata() {
  if (!fs.existsSync(OUTPUT_METADATA)) return new Map();
  try {
    const raw = JSON.parse(fs.readFileSync(OUTPUT_METADATA, "utf-8"));
    if (!Array.isArray(raw)) return new Map();
    return new Map(raw.map((m) => [m.name, m]));
  } catch {
    return new Map();
  }
}

/** 根据 name 将旧 index 的 chunks 分组 */
function groupChunksByName(existingIndex) {
  const map = new Map();
  if (!Array.isArray(existingIndex)) return map;
  for (const c of existingIndex) {
    const src = c?.metadata?.source || "_orphan";
    if (!map.has(src)) map.set(src, []);
    map.get(src).push(c);
  }
  return map;
}

// ---------- PDF 处理 ----------

async function processPDF(fileInfo, articlesResolved, splitter) {
  const relFromLib = path.relative(articlesResolved, fileInfo.path).split(path.sep).join("/");
  const dataBuffer = new Uint8Array(fs.readFileSync(fileInfo.path));
  const loadingTask = pdfjs.getDocument({ data: dataBuffer, verbosity: 0 });
  const pdfDocument = await loadingTask.promise;

  const chunks = [];
  let fileChunkCounter = 0;

  for (let pageNum = 1; pageNum <= pdfDocument.numPages; pageNum++) {
    const page = await pdfDocument.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item) => ("str" in item ? item.str : ""))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();

    if (pageText.length < 30) continue;

    const subChunks = await splitter.splitText(pageText);
    for (let index = 0; index < subChunks.length; index++) {
      const chunkContent = subChunks[index].trim();
      if (chunkContent.length < 15) continue;

      chunks.push({
        content: chunkContent,
        embedding: null, // 占位，后续批量填充
        metadata: {
          source: fileInfo.name,
          category: fileInfo.category,
          id: `${relFromLib}#p${pageNum}c${index}`,
          pageStart: pageNum,
          pageEnd: pageNum,
          chunkIndex: fileChunkCounter,
        },
      });
      fileChunkCounter++;
    }
  }

  return { chunks, chunkCount: fileChunkCounter };
}

// ---------- 主流程 ----------

async function indexPDFs() {
  // 1. 扫描文件系统
  const allFiles = [];

  function walkDir(dir, category = "未分类") {
    if (!fs.existsSync(dir)) return;
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        walkDir(fullPath, item);
      } else if (item.toLowerCase().endsWith(".pdf")) {
        allFiles.push({ path: fullPath, name: item, category, mtime: stat.mtimeMs });
      }
    }
  }

  walkDir(ARTICLES_DIR);
  console.log(`Articles dir: ${ARTICLES_DIR}`);
  console.log(`Found ${allFiles.length} PDF files.`);

  // 2. 加载旧索引 + 旧 metadata
  let existingIndex = [];
  if (fs.existsSync(OUTPUT_INDEX)) {
    try {
      existingIndex = JSON.parse(fs.readFileSync(OUTPUT_INDEX, "utf-8"));
    } catch { existingIndex = []; }
  }
  const oldMetadata = loadExistingMetadata();
  const oldChunksByName = groupChunksByName(existingIndex);

  // 3. 判断哪些文件是新的/变更的
  const unchangedFiles = new Set();
  const changedFiles = new Set();
  for (const f of allFiles) {
    const oldMeta = oldMetadata.get(f.name);
    if (oldMeta && oldMeta.mtime && oldChunksByName.has(f.name)) {
      // 比较 mtime（字符串和数字都用）
      const oldTime = new Date(oldMeta.mtime).getTime();
      if (oldTime === f.mtime) {
        unchangedFiles.add(f.name);
      } else {
        changedFiles.add(f.name);
      }
    } else {
      changedFiles.add(f.name);
    }
  }

  console.log(`  Unchanged: ${unchangedFiles.size} files (skip PDF parsing + embedding)`);
  console.log(`  New/changed: ${changedFiles.size} files`);

  // 4. 处理：unchanged → 复用旧 chunks，changed → 重新 PDF 解析
  const splitter = new RecursiveCharacterTextSplitter({ chunkSize: 1000, chunkOverlap: 200 });
  const articlesResolved = path.resolve(ARTICLES_DIR);

  const allChunks = [];
  const metadata = [];
  const pendingEmbeddings = []; // [{text, chunkRef}]

  for (const fileInfo of allFiles) {
    if (unchangedFiles.has(fileInfo.name)) {
      // 直接复用旧 chunks
      const oldChunks = oldChunksByName.get(fileInfo.name) || [];
      for (const c of oldChunks) {
        allChunks.push({
          content: c.content,
          embedding: c.embedding || null,
          metadata: { ...c.metadata },
        });
      }
      const m = oldMetadata.get(fileInfo.name);
      metadata.push({
        name: fileInfo.name,
        category: fileInfo.category,
        chunkCount: oldChunks.length,
        size: m ? m.size : fs.statSync(fileInfo.path).size,
        mtime: m ? m.mtime : new Date(fs.statSync(fileInfo.path).mtime).toISOString(),
      });
      console.log(`  [unchanged] ${fileInfo.name} (${oldChunks.length} chunks)`);
      continue;
    }

    // 变更或新增 → 重新处理
    console.log(`  [processing] ${fileInfo.name}...`);
    try {
      const { chunks, chunkCount } = await processPDF(fileInfo, articlesResolved, splitter);

      // 嵌入向量前先尝试从旧的 embeddingMap 恢复
      for (const c of chunks) {
        // 从旧 index 中按 id 或 content 尝试恢复 embedding
        let recovered = null;
        for (const old of existingIndex) {
          if (!Array.isArray(old?.embedding)) continue;
          if (old.metadata?.id === c.metadata.id) { recovered = old.embedding; break; }
          if (old.content === c.content && Array.isArray(old.embedding)) { recovered = old.embedding; break; }
        }
        if (recovered) {
          c.embedding = recovered;
        } else if (API_KEY) {
          pendingEmbeddings.push({ chunk: c });
        }
      }

      allChunks.push(...chunks);
      metadata.push({
        name: fileInfo.name,
        category: fileInfo.category,
        chunkCount,
        size: fs.statSync(fileInfo.path).size,
        mtime: new Date(fileInfo.mtime).toISOString(),
      });
      console.log(`  Done: ${chunkCount} chunks`);
    } catch (err) {
      console.error(`  Error processing ${fileInfo.name}:`, err);
    }
  }

  // 5. 批量填充 embedding（DeepSeek 一次可提交多条）
  if (pendingEmbeddings.length > 0) {
    console.log(`\nBatch-embedding ${pendingEmbeddings.length} chunks...`);
    const BATCH_SIZE = 20;
    for (let i = 0; i < pendingEmbeddings.length; i += BATCH_SIZE) {
      const batch = pendingEmbeddings.slice(i, i + BATCH_SIZE);
      const texts = batch.map((p) => p.chunk.content);
      process.stdout.write(`  batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(pendingEmbeddings.length / BATCH_SIZE)} (${batch.length} chunks)... `);
      const embs = await getEmbeddingsBatch(texts);
      // 获取当前批次 chunk 的旧 embedding map 引用
      for (let j = 0; j < batch.length; j++) {
        const emb = embs[j];
        if (emb) {
          batch[j].chunk.embedding = emb;
        }
      }
      process.stdout.write("done\n");
    }
    console.log("Batch embedding complete.");
  } else {
    console.log("\nNo new embeddings needed (all cached).");
  }

  // 6. 写出
  console.log(`\nTotal chunks: ${allChunks.length}`);

  const dataDir = path.dirname(OUTPUT_INDEX);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  fs.writeFileSync(OUTPUT_INDEX, JSON.stringify(allChunks, null, 2));
  fs.writeFileSync(OUTPUT_METADATA, JSON.stringify(metadata, null, 2));

  console.log(`Index saved to ${OUTPUT_INDEX}`);
  console.log(`Metadata saved to ${OUTPUT_METADATA}`);
}

indexPDFs().catch(console.error);
