/** RAG 全系统审计 —— 彻查搜索、索引、引用、边缘情况 */
import fs from "fs";
import path from "path";
import { localRAG, formatRagCitation, resolveBibEntry, cleanSourceName } from "../src/lib/rag.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const METADATA_PATH = path.join(DATA_DIR, "metadata.json");

const results = { pass: 0, fail: 0, warn: 0, checks: [] };

function check(name, fn) {
  try {
    const r = fn();
    if (r === true || r === undefined) { results.pass++; results.checks.push(`✅ ${name}`); }
    else { results.warn++; results.checks.push(`⚠️ ${name}: ${r}`); }
  } catch (e) {
    results.fail++; results.checks.push(`❌ ${name}: ${e.message}`);
  }
}

async function main() {
  console.log("=== RAG 全系统审计 ===\n");

  // ═══════════════════════════════════════════════════════════
  // 1. 索引完整性
  // ═══════════════════════════════════════════════════════════
  console.log("── 1. 索引完整性 ──");
  check("data/ 目录存在", () => fs.existsSync(DATA_DIR));
  check("metadata.json 存在", () => fs.existsSync(METADATA_PATH));

  const meta = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));
  check(`metadata 文件数 > 0`, () => meta.length === 0 ? `${meta.length} files` : undefined);
  console.log(`   文件数: ${meta.length}, 分类数: ${new Set(meta.map(m => m.category)).size}`);

  const cats = localRAG.getCategories();
  check(`getCategories() 返回 ${cats.length} 个分类`, () => cats.length < 3 ? `只有${cats.length}个` : undefined);

  // 检查每个分类的索引文件
  for (const cat of cats) {
    const idxPath = path.join(DATA_DIR, `index_${cat}.json`);
    check(`index_${cat}.json 存在`, () => !fs.existsSync(idxPath) ? "缺失" : undefined);
  }

  // 检查 index.json 不应该存在
  check("单体 index.json 不应存在（分索引模式）", () => fs.existsSync(path.join(DATA_DIR, "index.json")) ? "应删除" : undefined);

  // embedding 覆盖率
  let totalChunks = 0, chunksWithEmb = 0;
  for (const cat of cats) {
    const idx = JSON.parse(fs.readFileSync(path.join(DATA_DIR, `index_${cat}.json`), "utf-8"));
    totalChunks += idx.length;
    chunksWithEmb += idx.filter(c => Array.isArray(c.embedding) && c.embedding.length > 0).length;
  }
  const embPct = (chunksWithEmb / totalChunks * 100).toFixed(1);
  check(`Embedding 覆盖率: ${embPct}% (${chunksWithEmb}/${totalChunks})`,
    () => embPct < 10 ? `极低，语义检索不可用` : undefined);
  console.log(`   总chunks: ${totalChunks}, 有embedding: ${chunksWithEmb} (${embPct}%)`);

  // bib 元数据质量
  let bibCount = 0, bibWithTitle = 0, bibWithJournal = 0, bibWithYear = 0, bibWithFirstAuthor = 0;
  let wrongFirstAuthor = 0;
  for (const m of meta) {
    const bib = m.bib;
    if (!bib || Object.keys(bib).length === 0) continue;
    bibCount++;
    if (bib.title && bib.title.length > 5) bibWithTitle++;
    if (bib.journal) bibWithJournal++;
    if (bib.year) bibWithYear++;
    if (bib.firstAuthor && bib.firstAuthor.length <= 4) bibWithFirstAuthor++;
    // 检测 firstAuthor 像标题的坏 case（>6字中文大概率是标题）
    if (bib.firstAuthor && /[一-鿿]/.test(bib.firstAuthor) && bib.firstAuthor.length > 6) wrongFirstAuthor++;
  }
  console.log(`   bib 条目: ${bibCount} (of ${meta.length} files)`);
  console.log(`   含 title: ${bibWithTitle} (${(bibWithTitle/bibCount*100).toFixed(0)}%)`);
  console.log(`   含 journal: ${bibWithJournal} (${(bibWithJournal/bibCount*100).toFixed(0)}%)`);
  console.log(`   含 year: ${bibWithYear} (${(bibWithYear/bibCount*100).toFixed(0)}%)`);
  console.log(`   含 firstAuthor: ${bibWithFirstAuthor} (${(bibWithFirstAuthor/bibCount*100).toFixed(0)}%)`);
  check(`firstAuthor 误判为标题: ${wrongFirstAuthor} 篇`, () => wrongFirstAuthor > bibCount * 0.1 ? `${wrongFirstAuthor}篇仍像标题` : undefined);

  // ═══════════════════════════════════════════════════════════
  // 2. 搜索相关性
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 2. 搜索相关性 ──");

  // 中文搜索
  const r1 = await localRAG.search("热解温度催化剂", { limit: 5 });
  check(`中文"热解温度催化剂" → ${r1.length}条`, () => r1.length === 0 ? "0结果" : undefined);
  if (r1.length > 0) console.log(`   Top1: ${r1[0].metadata.source.slice(0,60)} [${r1[0].metadata.category}]`);

  // 英文搜索
  const r2 = await localRAG.search("pyrolysis catalyst biomass", { limit: 5 });
  check(`英文"pyrolysis catalyst biomass" → ${r2.length}条`, () => r2.length === 0 ? "0结果" : undefined);

  // 混合搜索
  const r3 = await localRAG.search("生物质 pyrolysis 催化剂", { limit: 5 });
  check(`混合"生物质 pyrolysis 催化剂" → ${r3.length}条`, () => r3.length === 0 ? "0结果" : undefined);

  // 空查询
  const r4 = await localRAG.search("", { limit: 5 });
  check(`空查询 → ${r4.length}条`, () => r4.length > 0 ? "不应有结果" : undefined);

  // 单字查询
  const r5 = await localRAG.search("热", { limit: 5 });
  check(`单字"热" → ${r5.length}条`, () => r5.length === 0 ? "0结果，单字无匹配" : undefined);

  // 无意义查询
  const r6 = await localRAG.search("xyzqwerty12345", { limit: 5 });
  check(`无意义"xyzqwerty12345" → ${r6.length}条`, () => r6.length > 0 ? "不应匹配" : undefined);

  // 分类过滤
  for (const cat of cats.slice(0, 2)) {
    const r = await localRAG.search("热解", { limit: 3, category: cat });
    check(`分类"${cat}"搜索 → ${r.length}条`, () => r.length === 0 ? "0结果" : undefined);
  }

  // ═══════════════════════════════════════════════════════════
  // 3. 引用格式化
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 3. 引用格式化 ──");

  const searchResults = await localRAG.search("pyrolysis", { limit: 10 });
  let citeErrors = 0;
  for (const c of searchResults.slice(0, 10)) {
    const citation = formatRagCitation(c);
    const bibEntry = resolveBibEntry(c.metadata.source);
    // 检查引用格式异常
    if (citation.includes("undefined") || citation.includes("null")) citeErrors++;
    if (/[一-鿿]{15,}/.test(citation) && citation.includes("[")) citeErrors++; // 标题当作者残余
  }
  check(`formatRagCitation 异常: ${citeErrors}/10`, () => citeErrors > 2 ? `${citeErrors}条异常` : undefined);

  // 检查 refListLines 格式
  const sources = [...new Set(searchResults.map(c => c.metadata.source))].slice(0, 5);
  for (const src of sources) {
    const entry = resolveBibEntry(src);
    if (!entry) { check(`resolveBibEntry("${src.slice(0,30)}...")`, () => "返回空"); continue; }
    const bib = entry.bib;
    if (!bib || Object.keys(bib).length === 0) continue;
    const validFields = [bib.firstAuthor, bib.title, bib.year, bib.journal, bib.doi].filter(Boolean).length;
    if (validFields < 2) check(`bib字段<2: ${src.slice(0,40)}`, () => `仅${validFields}字段`);
  }

  // ═══════════════════════════════════════════════════════════
  // 4. 性能
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 4. 性能 ──");
  const t0 = Date.now();
  await localRAG.search("热解", { limit: 5 });
  const t1 = Date.now() - t0;
  check(`首次搜索延迟: ${t1}ms`, () => t1 > 2000 ? `${t1}ms 偏慢` : undefined);

  const t2 = Date.now();
  await localRAG.search("催化剂", { limit: 5 });
  const t3 = Date.now() - t2;
  check(`二次搜索延迟: ${t3}ms`, () => t3 > 500 ? `${t3}ms 偏慢` : undefined);

  // ═══════════════════════════════════════════════════════════
  // 汇总
  // ═══════════════════════════════════════════════════════════
  console.log(`\n=== 审计结果 ===`);
  console.log(`✅ ${results.pass} 通过  ⚠️ ${results.warn} 警告  ❌ ${results.fail} 失败`);
  console.log(`\n详细:`);
  for (const c of results.checks) console.log(`  ${c}`);
}

main().catch(console.error);
