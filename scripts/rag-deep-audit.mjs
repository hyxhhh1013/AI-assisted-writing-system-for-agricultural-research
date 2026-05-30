/** RAG 深度审计 —— 专项排查 */
import fs from "fs";
import path from "path";
import { localRAG, formatRagCitation, resolveBibEntry } from "../src/lib/rag.ts";

const DATA_DIR = path.join(process.cwd(), "data");
const METADATA_PATH = path.join(DATA_DIR, "metadata.json");

async function main() {
  const meta = JSON.parse(fs.readFileSync(METADATA_PATH, "utf-8"));

  // ═══════════════════════════════════════════════════════════
  // 1. Embedding 为什么是 0%
  // ═══════════════════════════════════════════════════════════
  console.log("── 1. Embedding 状态 ──");
  const embedStatePath = path.join(DATA_DIR, "_embed_state.json");
  if (fs.existsSync(embedStatePath)) {
    const state = JSON.parse(fs.readFileSync(embedStatePath, "utf-8"));
    console.log(`   _embed_state: model=${state.model}, embedded=${state.lastEmbedCount}/${state.totalChunks}`);
  } else {
    console.log("   _embed_state.json 不存在 —— embedding 从未成功运行过");
  }
  // 检查 .env 配置
  const embUrl = process.env.RAG_EMBEDDINGS_URL;
  const embKey = process.env.RAG_EMBEDDING_API_KEY;
  console.log(`   RAG_EMBEDDINGS_URL: ${embUrl || "未配置"}`);
  console.log(`   RAG_EMBEDDING_API_KEY: ${embKey ? "已配置("+embKey.slice(0,8)+"...)" : "未配置"}`);

  // ═══════════════════════════════════════════════════════════
  // 2. bib 覆盖率详细分析
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 2. bib 覆盖率分析 ──");
  const bibEntries = meta.filter(m => m.bib && Object.keys(m.bib).length > 0);
  const withJournal = bibEntries.filter(m => m.bib.journal);
  const withFirstAuthor = bibEntries.filter(m => m.bib.firstAuthor && m.bib.firstAuthor.length <= 4);
  const withTitle = bibEntries.filter(m => m.bib.title && m.bib.title.length > 5);
  const withPages = bibEntries.filter(m => m.bib.pages);
  const withAuthors = bibEntries.filter(m => m.bib.authors && m.bib.authors.length > 0);
  const cnPapers = bibEntries.filter(m => /[一-鿿]/.test(m.bib.firstAuthor || ""));

  console.log(`   总计: ${bibEntries.length} 条 bib`);
  console.log(`   英文论文: ${bibEntries.length - cnPapers.length}, 中文论文: ${cnPapers.length}`);
  console.log(`   期刊名: ${withJournal.length} (${(withJournal.length/bibEntries.length*100).toFixed(0)}%)`);
  console.log(`   第一作者: ${withFirstAuthor.length} (${(withFirstAuthor.length/bibEntries.length*100).toFixed(0)}%)`);
  console.log(`   标题: ${withTitle.length} (${(withTitle.length/bibEntries.length*100).toFixed(0)}%)`);
  console.log(`   页码: ${withPages.length} (${(withPages.length/bibEntries.length*100).toFixed(0)}%)`);
  console.log(`   作者列表: ${withAuthors.length} (${(withAuthors.length/bibEntries.length*100).toFixed(0)}%)`);

  // 缺失期刊名的论文样例
  const noJournal = bibEntries.filter(m => !m.bib.journal).slice(0, 5);
  console.log("\n   缺期刊名的论文样例:");
  for (const m of noJournal) console.log(`     - ${m.name.slice(0,60)} (${m.documentType})`);

  // ═══════════════════════════════════════════════════════════
  // 3. 搜索性能异常：二次慢于首次
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 3. 性能深度检测 ──");
  // 预热
  await localRAG.search("test", { limit: 1 });
  const times = [];
  for (let i = 0; i < 5; i++) {
    const t0 = Date.now();
    await localRAG.search("热解催化剂", { limit: 5 });
    times.push(Date.now() - t0);
  }
  console.log(`   5次搜索延迟: ${times.join("ms, ")}ms`);
  console.log(`   平均: ${(times.reduce((a,b)=>a+b,0)/times.length).toFixed(0)}ms`);

  // 检查是否有 embedding API 调用拖慢
  // 如果有 embedding key 配置但 API 挂了，每次搜索都会超时等待
  const tEmb = Date.now();
  const emb = await localRAG.getEmbedding("test query");
  const tEmbMs = Date.now() - tEmb;
  console.log(`   getEmbedding 调用耗时: ${tEmbMs}ms (结果长度: ${emb.length})`);
  if (tEmbMs > 500 && emb.length === 0) {
    console.log("   ⚠️ embedding API 超时但返回空 —— 这会在每次搜索时拖慢速度！");
  }

  // ═══════════════════════════════════════════════════════════
  // 4. getFullText 测试
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 4. getFullText ──");
  const sampleFile = meta[0]?.name;
  if (sampleFile) {
    const fullText = localRAG.getFullText(sampleFile);
    console.log(`   getFullText("${sampleFile.slice(0,40)}..."): ${fullText.length} 字符`);
    if (fullText.length === 0) console.log("   ⚠️ 返回空！");
  }

  // ═══════════════════════════════════════════════════════════
  // 5. 搜索去重测试
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 5. 搜索去重 ──");
  const dedupTest = await localRAG.search("pyrolysis", { limit: 20 });
  const sources = dedupTest.map(c => c.metadata.source);
  const uniqueSources = new Set(sources);
  console.log(`   limit=20 → 实际${sources.length}条, 唯一文献${uniqueSources.size}篇`);
  if (sources.length !== uniqueSources.size) {
    console.log("   ⚠️ 同一文献重复出现！");
  }

  // maxPerSource 默认 4
  const perSource = {};
  for (const s of sources) perSource[s] = (perSource[s]||0)+1;
  const maxDup = Math.max(...Object.values(perSource));
  if (maxDup > 4) console.log(`   ⚠️ 单文献最多出现${maxDup}次（超过maxPerSource=4）`);

  // ═══════════════════════════════════════════════════════════
  // 6. 搜索相关性——同一个query在不同分类下的一致性
  // ═══════════════════════════════════════════════════════════
  console.log("\n── 6. 跨分类搜索一致性 ──");
  const cats = localRAG.getCategories();
  const query = "热解 催化剂";
  const allResults = await localRAG.search(query, { limit: 20 });
  const topCatsAll = allResults.slice(0, 10).map(c => c.metadata.category);
  console.log(`   全库搜索 Top10 分类分布: ${JSON.stringify(topCatsAll)}`);
  // 分类分布
  const catDist = {};
  for (const c of allResults) catDist[c.metadata.category] = (catDist[c.metadata.category]||0)+1;
  console.log(`   全库分类分布: ${JSON.stringify(catDist)}`);
}

main().catch(console.error);
