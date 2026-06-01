/**
 * RAG 索引格式转换 — JSON → content JSON + binary embedding
 *
 * 把巨型 index_*.json（含 2048 维 float JSON 数组 embedding）
 * 拆成轻量 JSON（仅 content + metadata）+ float32 二进制 .emb 文件。
 *
 * 使用：
 *   node scripts/convert-index-to-binary.mjs                     转换全部
 *   node scripts/convert-index-to-binary.mjs --dry-run           仅预览
 *   node scripts/convert-index-to-binary.mjs --category 茶学      仅转换指定分类
 *
 * .emb 二进制格式（小端序）：
 *   [0..3]   version: uint32 = 1
 *   [4..7]   dim: uint32（嵌入维度，如 2048）
 *   [8..]    float32[] — chunk[0] 的 embedding，chunk[1] 的 embedding，...
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const DATA_DIR = path.join(projectRoot, "data");
const BACKUP_DIR = path.join(DATA_DIR, ".backup");

// ─── CLI flags ──────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes("--dry-run");

function getCategoryArg() {
  const eq = process.argv.find((a) => a.startsWith("--category="));
  if (eq) return eq.slice("--category=".length);
  const idx = process.argv.indexOf("--category");
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return undefined;
}

const CATEGORY = getCategoryArg();

function log(msg) {
  console.log(msg);
}

// ─── Binary helpers ─────────────────────────────────────────────────────

/**
 * 写入 float32 数组到 Buffer（小端序）
 */
function writeFloat32LE(arr) {
  const buf = Buffer.allocUnsafe(arr.length * 4);
  for (let i = 0; i < arr.length; i++) {
    buf.writeFloatLE(arr[i], i * 4);
  }
  return buf;
}

/**
 * 从 Buffer 读 float32 数组（小端序）
 */
function readFloat32LE(buf, offset, count) {
  const arr = new Array(count);
  for (let i = 0; i < count; i++) {
    arr[i] = buf.readFloatLE(offset + i * 4);
  }
  return arr;
}

/**
 * 写入 .emb 文件
 * @param {string} filePath 输出路径
 * @param {number[][]} embeddings 所有 chunk 的 embedding 数组
 * @param {number} dim 嵌入维度
 */
function writeEmbeddingFile(filePath, embeddings, dim) {
  const header = Buffer.alloc(8);
  header.writeUInt32LE(1, 0);       // version
  header.writeUInt32LE(dim, 4);     // dim

  const chunks = [];
  let totalFloats = 0;
  for (const emb of embeddings) {
    if (!emb || emb.length !== dim) {
      // 缺失或维度不对 → 写零向量
      const zero = new Array(dim).fill(0);
      chunks.push(writeFloat32LE(zero));
      totalFloats += dim;
    } else {
      chunks.push(writeFloat32LE(emb));
      totalFloats += emb.length;
    }
  }

  const buf = Buffer.concat([header, ...chunks]);
  fs.writeFileSync(filePath, buf);
  log(`  wrote ${filePath}: ${(buf.length / 1024 / 1024).toFixed(1)}MB (${embeddings.length} embeddings × ${dim}d)`);
  return buf.length;
}

/**
 * 验证 .emb 文件
 * @returns {number} chunks 数量
 */
function verifyEmbeddingFile(filePath) {
  const buf = fs.readFileSync(filePath);
  if (buf.length < 8) throw new Error(`${filePath}: too small (${buf.length} bytes)`);

  const version = buf.readUInt32LE(0);
  const dim = buf.readUInt32LE(4);
  if (version !== 1) throw new Error(`${filePath}: unknown version ${version}`);

  const dataLen = buf.length - 8;
  if (dataLen % (dim * 4) !== 0) {
    throw new Error(`${filePath}: invalid data size ${dataLen}, not aligned to ${dim * 4}`);
  }

  const chunkCount = dataLen / (dim * 4);
  log(`  verify ${path.basename(filePath)}: version=${version} dim=${dim} chunks=${chunkCount} OK`);
  return chunkCount;
}

/** 随机抽样对比 JSON 内 embedding 与 .emb 二进制是否一致 */
function sampleVerifyEmbeddings(embeddings, embPath, dim, sampleCount) {
  const buf = fs.readFileSync(embPath);
  const fileDim = buf.readUInt32LE(4);
  if (fileDim !== dim) throw new Error(`${embPath}: dim mismatch ${fileDim} vs ${dim}`);

  const indices = [];
  const pool = embeddings.map((e, i) => (e ? i : -1)).filter((i) => i >= 0);
  if (pool.length === 0) return;

  for (let n = 0; n < sampleCount && n < pool.length; n++) {
    const pick = pool[Math.floor(Math.random() * pool.length)];
    if (!indices.includes(pick)) indices.push(pick);
  }

  for (const idx of indices) {
    const expected = embeddings[idx];
    const fromFile = readFloat32LE(buf, 8 + idx * dim * 4, dim);
    for (let j = 0; j < dim; j++) {
      if (Math.abs(expected[j] - fromFile[j]) > 1e-5) {
        throw new Error(`${embPath}: chunk ${idx} float mismatch at dim ${j}`);
      }
    }
  }
  log(`  sample verify: ${indices.length} chunks OK`);
}

// ─── Main conversion ───────────────────────────────────────────────────

/**
 * 转换一个分类的索引文件
 * @returns {{ success: boolean, chunkCount: number, jsonSizeBefore: number, jsonSizeAfter: number, embSize: number }}
 */
function convertCategory(category) {
  const indexPath = path.join(DATA_DIR, `index_${category}.json`);
  const embPath = path.join(DATA_DIR, `index_${category}.emb`);

  if (!fs.existsSync(indexPath)) {
    log(`  skip ${category}: index file not found`);
    return null;
  }

  const jsonSizeBefore = fs.statSync(indexPath).size;

  log(`\n  Converting index_${category}.json (${(jsonSizeBefore / 1024 / 1024).toFixed(1)}MB)...`);

  // 1. 读取原始 JSON
  let chunks;
  try {
    const raw = fs.readFileSync(indexPath, "utf-8");
    chunks = JSON.parse(raw);
  } catch (e) {
    log(`  ERROR reading ${indexPath}: ${e.message}`);
    return null;
  }

  if (!Array.isArray(chunks) || chunks.length === 0) {
    log(`  skip ${category}: empty or invalid`);
    return null;
  }

  log(`  loaded ${chunks.length} chunks`);

  // 2. 提取 embeddings，确定维度
  const embeddings = new Array(chunks.length);
  let dim = 0;
  let embedCount = 0;

  for (let i = 0; i < chunks.length; i++) {
    const emb = chunks[i]?.embedding;
    if (Array.isArray(emb) && emb.length > 0) {
      embeddings[i] = emb;
      if (dim === 0) dim = emb.length;
      embedCount++;
    } else {
      embeddings[i] = null;
    }
  }

  if (dim === 0) {
    log(`  skip ${category}: no embeddings found`);
    return null;
  }

  log(`  embeddings: ${embedCount}/${chunks.length} (dim=${dim})`);

  // 3. 备份原始文件
  if (!DRY_RUN) {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });
    const backupPath = path.join(BACKUP_DIR, `index_${category}.json`);
    fs.copyFileSync(indexPath, backupPath);
    log(`  backup: ${backupPath}`);
  }

  // 4. 写入 .emb 文件
  let embSize = 0;
  if (!DRY_RUN) {
    embSize = writeEmbeddingFile(embPath, embeddings, dim);
  } else {
    embSize = 8 + chunks.length * dim * 4;
    log(`  [DRY RUN] would write ${path.basename(embPath)}: ${(embSize / 1024 / 1024).toFixed(1)}MB`);
  }

  // 5. 从 JSON 中删除 embedding 字段，写入新 JSON
  let strippedSize = 0;
  for (const chunk of chunks) {
    delete chunk.embedding;
  }

  if (!DRY_RUN) {
    const newJson = JSON.stringify(chunks);
    strippedSize = Buffer.byteLength(newJson, "utf-8");
    fs.writeFileSync(indexPath, newJson, "utf-8");
  } else {
    // 用一份拷贝估算
    const copy = chunks.map((c) => ({ ...c, embedding: undefined }));
    delete copy[0]?.embedding;
    strippedSize = Buffer.byteLength(JSON.stringify(chunks), "utf-8");
  }

  log(`  JSON: ${(jsonSizeBefore / 1024 / 1024).toFixed(1)}MB → ${(strippedSize / 1024 / 1024).toFixed(1)}MB (${DRY_RUN ? 'estimated' : 'actual'})`);

  // 6. 验证
  if (!DRY_RUN) {
    const verifiedCount = verifyEmbeddingFile(embPath);
    if (verifiedCount !== chunks.length) {
      log(`  WARNING: emb chunks=${verifiedCount} != json chunks=${chunks.length}`);
    }
    const expectedEmb = 8 + chunks.length * dim * 4;
    if (embSize !== expectedEmb) {
      throw new Error(`${embPath}: size ${embSize} != expected ${expectedEmb}`);
    }
    sampleVerifyEmbeddings(embeddings, embPath, dim, Math.min(5, chunks.length));
  }

  return {
    success: true,
    chunkCount: chunks.length,
    jsonSizeBefore,
    jsonSizeAfter: strippedSize,
    embSize,
  };
}

// ─── Entry ──────────────────────────────────────────────────────────────

function main() {
  log("=== RAG Index Converter: JSON → JSON + Binary Embeddings ===\n");

  if (!fs.existsSync(DATA_DIR)) {
    log(`ERROR: data directory not found at ${DATA_DIR}`);
    process.exit(1);
  }

  // 发现所有分类
  const categories = [];
  for (const file of fs.readdirSync(DATA_DIR)) {
    const match = file.match(/^index_(.+)\.json$/);
    if (match && !file.includes(".emb")) {
      if (CATEGORY && match[1] !== CATEGORY) continue;
      categories.push(match[1]);
    }
  }

  if (categories.length === 0) {
    log(CATEGORY ? `No index found for category: ${CATEGORY}` : "No index_*.json files found");
    process.exit(0);
  }

  log(`Found ${categories.length} categories: ${categories.join(", ")}`);
  if (DRY_RUN) log("--- DRY RUN MODE (no files will be modified) ---\n");

  const results = [];
  let totalBefore = 0, totalAfter = 0, totalEmb = 0;

  for (const cat of categories) {
    const r = convertCategory(cat);
    if (r) {
      results.push({ category: cat, ...r });
      totalBefore += r.jsonSizeBefore;
      totalAfter += r.jsonSizeAfter;
      totalEmb += r.embSize;
    }
  }

  // 汇总
  log("\n=== Summary ===");
  log(`${"Category".padEnd(16)} ${"Before".padStart(8)} ${"After".padStart(8)} ${"Emb".padStart(8)} ${"Saved".padStart(8)}`);
  log("-".repeat(56));

  for (const r of results) {
    const saved = r.jsonSizeBefore - r.jsonSizeAfter - r.embSize;
    log(`${r.category.padEnd(16)} ${(r.jsonSizeBefore / 1024 / 1024).toFixed(0).padStart(6)}MB ${(r.jsonSizeAfter / 1024 / 1024).toFixed(0).padStart(6)}MB ${(r.embSize / 1024 / 1024).toFixed(0).padStart(6)}MB ${(saved / 1024 / 1024).toFixed(0).padStart(6)}MB`);
  }
  log("-".repeat(56));
  const totalSaved = totalBefore - totalAfter - totalEmb;
  log(`${"TOTAL".padEnd(16)} ${(totalBefore / 1024 / 1024).toFixed(0).padStart(6)}MB ${(totalAfter / 1024 / 1024).toFixed(0).padStart(6)}MB ${(totalEmb / 1024 / 1024).toFixed(0).padStart(6)}MB ${(totalSaved / 1024 / 1024).toFixed(0).padStart(6)}MB`);

  if (DRY_RUN) {
    log("\nRun without --dry-run to apply changes.");
  } else {
    log("\n✅ Conversion complete. Original files backed up to data/.backup/");
  }
}

main();
