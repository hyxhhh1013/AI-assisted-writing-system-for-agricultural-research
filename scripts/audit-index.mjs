import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const metaPath = path.join(root, "data/metadata.json");
const indexPath = path.join(root, "data/index.json");

const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));

const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 200;

console.log("=== 索引审计报告 ===\n");

// 1. 元数据字段
const withBib = meta.filter((m) => m.bib && Object.keys(m.bib).length > 0);
const withDocType = meta.filter((m) => m.documentType);
console.log(`文献总数: ${meta.length}`);
console.log(`含 documentType: ${withDocType.length} (${((withDocType.length / meta.length) * 100).toFixed(1)}%)`);
console.log(`含 bib 结构化书目: ${withBib.length} (${((withBib.length / meta.length) * 100).toFixed(1)}%)`);

if (withBib[0]) {
  console.log("\n书目样例:", JSON.stringify(withBib[0].bib, null, 2));
}
if (!withBib.length && meta[0]) {
  console.log("\nmetadata 样例字段:", Object.keys(meta[0]).join(", "));
}

// 2. 分块统计
console.log(`\n总 chunk 数: ${index.length}`);
const lens = index.map((c) => c.content?.length || 0);
const avg = Math.round(lens.reduce((a, b) => a + b, 0) / lens.length);
console.log(`块长度 min/max/avg: ${Math.min(...lens)} / ${Math.max(...lens)} / ${avg} (规定 chunkSize=${CHUNK_SIZE}, overlap=${CHUNK_OVERLAP})`);

const buckets = { "<500": 0, "500-999": 0, "1000-1499": 0, ">=1500": 0 };
for (const l of lens) {
  if (l < 500) buckets["<500"]++;
  else if (l < 1000) buckets["500-999"]++;
  else if (l < 1500) buckets["1000-1499"]++;
  else buckets[">=1500"]++;
}
console.log("长度分布:", buckets);

// 3. embedding
const hasEmb = index.filter((c) => Array.isArray(c.embedding) && c.embedding.length > 0).length;
console.log(`含向量 embedding: ${hasEmb} / ${index.length} (${((hasEmb / index.length) * 100).toFixed(1)}%)`);

// 4. metadata 一致性
const bySource = new Map();
for (const c of index) {
  const s = c.metadata?.source || "?";
  bySource.set(s, (bySource.get(s) || 0) + 1);
}
const mismatches = meta.filter((m) => (bySource.get(m.name) || 0) !== m.chunkCount);
console.log(`metadata.chunkCount 与 index 不一致: ${mismatches.length} 篇`);
if (mismatches.length) {
  for (const m of mismatches.slice(0, 5)) {
    console.log(`  - ${m.name}: meta=${m.chunkCount}, actual=${bySource.get(m.name) || 0}`);
  }
}

// 5. chunk metadata 完整性
const missingFields = { source: 0, category: 0, id: 0, pageStart: 0, documentType: 0 };
for (const c of index) {
  const md = c.metadata || {};
  if (!md.source) missingFields.source++;
  if (!md.category) missingFields.category++;
  if (!md.id) missingFields.id++;
  if (md.pageStart == null) missingFields.pageStart++;
  if (!md.documentType) missingFields.documentType++;
}
console.log("\nchunk metadata 缺失:", missingFields);

// 6. 抽样检查：同页多块、空内容、乱码
let emptyContent = 0;
let shortContent = 0;
let garbled = 0;
for (const c of index) {
  const t = c.content || "";
  if (!t.trim()) emptyContent++;
  else if (t.length < 15) shortContent++;
  if (/[\u0000-\u0008]/.test(t) || (t.match(/\?{10,}/) && t.length < 200)) garbled++;
}
console.log(`空内容块: ${emptyContent}, 过短(<15): ${shortContent}, 疑似乱码: ${garbled}`);

// 7. 按页分块 vs 跨页 — 当前实现是 per-page split
const multiChunkPages = new Map();
for (const c of index) {
  const key = `${c.metadata?.source}#p${c.metadata?.pageStart}`;
  multiChunkPages.set(key, (multiChunkPages.get(key) || 0) + 1);
}
const pagesWithMultiple = [...multiChunkPages.values()].filter((n) => n > 1).length;
console.log(`\n分块策略: 按页提取后 RecursiveCharacterTextSplitter`);
console.log(`单页被拆成多块的情况: ${pagesWithMultiple} 页`);

// 8. 随机抽 3 篇做内容可读性
console.log("\n=== 内容可读性抽样 ===");
const sampleNames = meta.slice(0, 3).map((m) => m.name);
for (const name of sampleNames) {
  const chunks = index.filter((c) => c.metadata?.source === name);
  const first = chunks[0];
  const mid = chunks[Math.floor(chunks.length / 2)];
  console.log(`\n【${name}】 ${chunks.length} 块`);
  if (first) {
    console.log(`  首块 p${first.metadata?.pageStart} (${first.content.length}字): ${first.content.slice(0, 120)}...`);
  }
  if (mid && mid !== first) {
    console.log(`  中段 p${mid.metadata?.pageStart} (${mid.content.length}字): ${mid.content.slice(0, 120)}...`);
  }
}

// 9. 检查 PDF 目录与索引覆盖
function walkPdfs(dir, category = "未分类", out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const item of fs.readdirSync(dir)) {
    const full = path.join(dir, item);
    const st = fs.statSync(full);
    if (st.isDirectory()) walkPdfs(full, item, out);
    else if (item.toLowerCase().endsWith(".pdf")) out.push({ name: item, category });
  }
  return out;
}

const candidates = [
  path.resolve(root, process.env.RAG_ARTICLES_DIR || "papers"),
  path.join(root, "热化学小组文章-2024.12.27"),
  path.join(root, "papers"),
];
let pdfDir = candidates.find((d) => fs.existsSync(d));
if (!pdfDir) pdfDir = candidates[0];

const pdfsOnDisk = walkPdfs(pdfDir);
const metaNames = new Set(meta.map((m) => m.name));
const indexNames = new Set([...bySource.keys()].filter((k) => k !== "?"));

const missingFromMeta = pdfsOnDisk.filter((p) => !metaNames.has(p.name));
const missingFromIndex = pdfsOnDisk.filter((p) => !indexNames.has(p.name));
const orphanMeta = meta.filter((m) => !pdfsOnDisk.some((p) => p.name === m.name));

console.log(`\n=== PDF 覆盖 (${pdfDir}) ===`);
console.log(`磁盘 PDF: ${pdfsOnDisk.length}, metadata: ${meta.length}, index 来源: ${indexNames.size}`);
console.log(`磁盘有但 metadata 无: ${missingFromMeta.length}`);
console.log(`磁盘有但 index 无: ${missingFromIndex.length}`);
console.log(`metadata 有但磁盘无: ${orphanMeta.length}`);
if (missingFromIndex.length) {
  console.log("  未索引样例:", missingFromIndex.slice(0, 3).map((p) => p.name));
}

// 10. 分块是否符合 chunkSize（允许 overlap 导致略超）
const overSize = lens.filter((l) => l > CHUNK_SIZE + 50).length;
const underSize = lens.filter((l) => l >= 15 && l < 100).length;
console.log(`\n=== 分块规范 ===`);
console.log(`超过 chunkSize+50 (${CHUNK_SIZE + 50}) 的块: ${overSize}`);
console.log(`偏短块 (100-${CHUNK_SIZE - 1}): ${underSize} (末块/短页正常)`);
