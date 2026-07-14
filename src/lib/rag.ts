import fs from "fs";
import fsp from "fs/promises";
import type { FileHandle } from "fs/promises";
import path from "path";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import {
  ensureBibMapLoaded,
  getCachedBibMap,
  invalidateKnowledgeBibCache,
  listKnowledgeCategories,
} from "@/lib/knowledge-metadata";
import { cosineSimilarity } from "./similarity";
import { createLogger } from "@/lib/logger";

const log = createLogger("rag");

/** 单条索引块（与 data/index.json 一致，metadata 可扩展） */
export interface RagChunk {
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    category: string;
    id: string;
    documentType?: string;
    pageStart?: number;
    pageEnd?: number;
    chunkIndex?: number;
  };
}

export interface BibEntry {
  name: string;
  path?: string;
  category: string;
  chunkCount: number;
  documentType?: string;
  gbTag?: string;
  bib?: {
    title?: string;
    authors?: string[];
    firstAuthor?: string;
    year?: number;
    journal?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    doi?: string;
    patentNumber?: string;
    inventors?: string[];
    applicant?: string;
    publicationDate?: string;
    isbn?: string;
    publisher?: string;
  } | null;
}

// ── 二进制 Embedding 存储 ─────────────────────────────────────────────────

const EMB_HEADER_SIZE = 8; // version: uint32 + dim: uint32

/**
 * 从 .emb 二进制文件按需读取 embedding。
 * 文件格式（小端序）：
 *   [0..3]   version: uint32 = 1
 *   [4..7]   dim: uint32
 *   [8..]    float32[] — 按 chunk 索引顺序平铺
 */
class EmbeddingStore {
  // 不再把整个 .emb 常驻内存；只保留文件句柄 + 维度信息，按需 pread 单条向量。
  private meta = new Map<string, { fh: FileHandle; fd: number; dim: number; count: number }>();

  /** 检查指定分类是否有 .emb 文件 */
  has(category: string): boolean {
    const p = this.embPath(category);
    return fs.existsSync(p);
  }

  /** 打开 .emb 文件句柄并读取头部（不读全文，内存恒定） */
  async load(category: string): Promise<{ dim: number; count: number }> {
    const cached = this.meta.get(category);
    if (cached) return { dim: cached.dim, count: cached.count };

    const p = this.embPath(category);
    if (!fs.existsSync(p)) return { dim: 0, count: 0 };

    const fh = await fsp.open(p, "r");
    try {
      const header = Buffer.alloc(EMB_HEADER_SIZE);
      await fh.read(header, 0, EMB_HEADER_SIZE, 0);
      const version = header.readUInt32LE(0);
      const dim = header.readUInt32LE(4);
      if (version !== 1 || dim <= 0) {
        log.error("embedding file unknown version/dim", { path: p, version, dim });
        await fh.close();
        return { dim: 0, count: 0 };
      }
      const { size } = await fh.stat();
      const count = Math.floor((size - EMB_HEADER_SIZE) / (dim * 4));
      this.meta.set(category, { fh, fd: fh.fd, dim, count });
      return { dim, count };
    } catch (e) {
      log.fail("embedding file open failed", e, { path: p });
      try {
        await fh.close();
      } catch {
        /* ignore */
      }
      return { dim: 0, count: 0 };
    }
  }

  /** 按需从磁盘 pread 单条向量（同步读，单次仅 dim×4 字节） */
  get(category: string, index: number): number[] | null {
    const m = this.meta.get(category);
    if (!m || index < 0 || index >= m.count) return null;

    const byteLen = m.dim * 4;
    const buf = Buffer.allocUnsafe(byteLen);
    const offset = EMB_HEADER_SIZE + index * byteLen;
    try {
      fs.readSync(m.fd, buf, 0, byteLen, offset);
    } catch (e) {
      log.fail("embedding pread failed", e, { category, index });
      return null;
    }
    const arr = new Array<number>(m.dim);
    for (let i = 0; i < m.dim; i++) arr[i] = buf.readFloatLE(i * 4);
    return arr;
  }

  /** 关闭并卸载指定分类的文件句柄 */
  unload(category: string): void {
    const m = this.meta.get(category);
    if (m) {
      void m.fh.close().catch(() => {});
      this.meta.delete(category);
    }
  }

  clear(): void {
    for (const m of this.meta.values()) void m.fh.close().catch(() => {});
    this.meta.clear();
  }

  private embPath(category: string): string {
    return path.join(process.cwd(), `data/index_${category}.emb`);
  }
}

// ── 书目元数据（Prisma KnowledgeFile，见 knowledge-metadata.ts）────────────

export function resolveBibEntry(source: string): BibEntry | undefined {
  const map = getCachedBibMap();
  const direct = map.get(source);
  if (direct) return direct;
  const base = path.basename(source.replace(/\\/g, "/"));
  const byBase = map.get(base);
  if (byBase) return byBase;
  if (!source.endsWith(".pdf")) {
    const withPdf = map.get(source + ".pdf");
    if (withPdf) return withPdf;
    const baseWithPdf = map.get(base + ".pdf");
    if (baseWithPdf) return baseWithPdf;
  }
  return undefined;
}

/** @deprecated 优先使用 ensureBibMapLoaded；同步读缓存，未加载时为空 Map */
export function getBibMap(): Map<string, BibEntry> {
  return getCachedBibMap();
}

export function invalidateBibCache(): void {
  invalidateKnowledgeBibCache();
}

export { ensureBibMapLoaded };

// ── 检索算法常量 ───────────────────────────────────────────────────────────

const RRF_K = 60;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const DEFAULT_MAX_PER_SOURCE = 4;
const EMB_QUERY_CACHE_MAX = 256;
const SUBSET_CACHE_MAX = 16;

function getEmbeddingsUrl(): string {
  const full = process.env.RAG_EMBEDDINGS_URL?.trim();
  if (full) return full;
  const base = (process.env.RAG_EMBEDDING_API_BASE || "").trim();
  if (base) return `${base.replace(/\/$/, "")}/embeddings`;
  return "";
}

function getEmbeddingModel(): string {
  return process.env.RAG_EMBEDDING_MODEL?.trim() || "";
}

function getEmbeddingApiKey(): string | undefined {
  return process.env.RAG_EMBEDDING_API_KEY?.trim()
    || (process.env.RAG_EMBEDDINGS_URL?.trim() ? process.env.DEEPSEEK_API_KEY?.trim() : undefined)
    || (process.env.RAG_EMBEDDING_API_BASE?.trim() ? process.env.DEEPSEEK_API_KEY?.trim() : undefined)
    || undefined;
}

// ── 分词 ──────────────────────────────────────────────────────────────────

function extractQueryTerms(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const keywords: string[] = [];
  if (/[一-龥]/.test(q)) {
    const segments = q.toLowerCase().split(/[^一-龥a-z0-9]+/i).filter((s) => s.length >= 1);
    for (const seg of segments) {
      if (/[一-龥]/.test(seg)) {
        for (let i = 0; i < seg.length; i++) keywords.push(seg[i]);
        if (seg.length >= 2) {
          for (let i = 0; i < seg.length - 1; i++) keywords.push(seg.substring(i, i + 2));
        }
        if (seg.length >= 3) keywords.push(seg);
      } else if (seg.length > 1) {
        keywords.push(seg);
      }
    }
  } else {
    keywords.push(...q.toLowerCase().split(/\s+/).filter((k) => k.length > 1));
  }
  return Array.from(new Set(keywords)).filter((t) => t.length > 0);
}

// ── 倒排索引 ──────────────────────────────────────────────────────────────

type InvertedIndex = Map<string, Map<number, number>>;

const INDEX_BUILD_BATCH = 1500;
const INDEX_MERGE_BATCH = 5000;

/** 让出事件循环一次（宏任务），避免长 CPU 循环冻结整个服务 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/** 把单个 chunk 的词项写入倒排索引（globalIndex = 该 chunk 在 pool 中的下标） */
function indexChunkInto(idx: InvertedIndex, content: string, globalIndex: number): void {
  const tokens = content.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(Boolean);
  const tfMap = new Map<string, number>();
  for (const t of tokens) {
    tfMap.set(t, (tfMap.get(t) || 0) + 1);
    if (/[一-鿿]/.test(t)) {
      for (const ch of t) tfMap.set(ch, (tfMap.get(ch) || 0) + 1);
    }
  }
  for (const [term, tf] of tfMap) {
    let posting = idx.get(term);
    if (!posting) {
      posting = new Map();
      idx.set(term, posting);
    }
    posting.set(globalIndex, tf);
  }
}

/** 协作式构建倒排索引：每 INDEX_BUILD_BATCH 个 chunk 让出一次事件循环 */
async function buildInvertedIndexAsync(chunks: RagChunk[]): Promise<InvertedIndex> {
  const idx: InvertedIndex = new Map();
  for (let i = 0; i < chunks.length; i++) {
    indexChunkInto(idx, chunks[i].content, i);
    if (i > 0 && i % INDEX_BUILD_BATCH === 0) await yieldToEventLoop();
  }
  return idx;
}

/**
 * 把分类倒排索引按 offset 合并进全库索引——避免对全库重新分词（最重的 CPU）。
 * 分批让出事件循环。
 */
async function mergeInvertedIndexInto(
  target: InvertedIndex,
  src: InvertedIndex,
  offset: number,
): Promise<void> {
  let n = 0;
  for (const [term, posting] of src) {
    let tgt = target.get(term);
    if (!tgt) {
      tgt = new Map();
      target.set(term, tgt);
    }
    for (const [chunkIdx, tf] of posting) tgt.set(chunkIdx + offset, tf);
    if (++n % INDEX_MERGE_BATCH === 0) await yieldToEventLoop();
  }
}

function bm25FromIndex(idx: InvertedIndex, chunks: RagChunk[], terms: string[]): number[] {
  const N = chunks.length;
  const scores = new Float32Array(N);
  if (N === 0 || terms.length === 0) return Array.from(scores);
  const docLens = chunks.map((c) => Math.max(1, c.content.length));
  const avgdl = docLens.reduce((a, b) => a + b, 0) / N;
  for (const t of terms) {
    const posting = idx.get(t);
    if (!posting || posting.size === 0) continue;
    const df = posting.size;
    const idf = Math.log((N - df + 0.5) / (df + 0.5) + 1);
    if (idf <= 0) continue;
    for (const [chunkIdx, tf] of posting) {
      const dl = docLens[chunkIdx];
      scores[chunkIdx] += idf * ((tf * (BM25_K1 + 1)) / (tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl))));
    }
  }
  return Array.from(scores);
}

// ── RRF / 去重 ────────────────────────────────────────────────────────────

function argsortDescending(scores: number[]): number[] {
  return scores.map((s, i) => ({ s, i })).sort((a, b) => b.s - a.s || a.i - b.i).map((x) => x.i);
}

function ranksFromScores(scores: number[], zeroAsMissing: boolean): number[] {
  const n = scores.length;
  const order = argsortDescending(scores);
  const rank = new Array<number>(n).fill(n + RRF_K);
  let pos = 1;
  for (const docIdx of order) {
    if (zeroAsMissing && scores[docIdx] <= 0) break;
    rank[docIdx] = pos;
    pos++;
  }
  return rank;
}

function rrfFromRanks(rankLists: number[][]): number[] {
  const n = rankLists[0]?.length ?? 0;
  const out = new Array<number>(n).fill(0);
  for (const ranks of rankLists) {
    for (let i = 0; i < n; i++) {
      const r = ranks[i];
      if (r <= n) out[i] += 1 / (RRF_K + r);
    }
  }
  return out;
}

function diversifyByCategory(topChunks: RagChunk[], allChunks: RagChunk[]): RagChunk[] {
  if (topChunks.length < 3) return topChunks;
  const topCats = new Set(topChunks.map((c) => c.metadata.category));
  if (topCats.size >= 2) return topChunks;
  const otherChunks = allChunks.filter((c) => !topCats.has(c.metadata.category) && !topChunks.includes(c));
  if (otherChunks.length === 0) return topChunks;
  const result = topChunks.slice(0, -1);
  result.push(otherChunks[0]);
  return result;
}

function diversifyBySource(order: number[], chunks: RagChunk[], limit: number, maxPerSource: number): RagChunk[] {
  const perSource = new Map<string, number>();
  const out: RagChunk[] = [];
  for (const idx of order) {
    const raw = chunks[idx].metadata.source || "unknown";
    const src = path.basename(raw.replace(/\\/g, "/"));
    const c = (perSource.get(src) ?? 0) + 1;
    if (c > maxPerSource) continue;
    perSource.set(src, c);
    out.push(chunks[idx]);
    if (out.length >= limit) break;
  }
  return out;
}

// ── LocalRAG 主类 ────────────────────────────────────────────────────────

export class LocalRAG {
  private chunks: RagChunk[] | null = null;
  private categoryChunks = new Map<string, RagChunk[]>();
  private categoryIndexes = new Map<string, InvertedIndex>();
  private embCategoryMap = new Map<string, string>(); // chunk category → emb category
  private allChunksCache: RagChunk[] | null = null;
  private allIndexCache: InvertedIndex | null = null;
  // 与 allChunksCache 对齐：每个全局 chunk 的 (emb 分类, 分类内下标)，用于按需取向量
  private allEmbRefCache: { category: string; localIndex: number }[] | null = null;
  // query 文本 → 向量的 LRU 缓存（避免重复 query 的 embedding 网络往返）
  private embQueryCache = new Map<string, number[]>();
  // 加载去重：避免 warmup 与检索并发触发重复的索引构建
  private categoryLoadInFlight = new Map<string, Promise<void>>();
  private allLoadInFlight: Promise<{ chunks: RagChunk[]; index: InvertedIndex }> | null = null;
  // 多分类子集检索缓存（key = 排序后的分类列表）
  private subsetCache = new Map<
    string,
    { chunks: RagChunk[]; index: InvertedIndex; embRef: { category: string; localIndex: number }[] }
  >();
  private indexPath = path.join(process.cwd(), "data/index.json");
  private embStore = new EmbeddingStore();

  private getCategoryIndexPath(category: string): string {
    return path.join(process.cwd(), `data/index_${category}.json`);
  }

  /** 列出所有可用的分类 */
  async getCategories(): Promise<string[]> {
    return listKnowledgeCategories();
  }

  /**
   * 预热：后台预加载全库 chunks + 倒排索引 + .emb，
   * 把冷启动开销从「用户第一次检索」移到「服务启动后」。
   * 幂等——ensureAllLoaded 命中缓存后直接返回。
   */
  async warmup(): Promise<{ chunks: number; ms: number }> {
    const t0 = Date.now();
    await ensureBibMapLoaded();
    const { chunks } = await this.ensureAllLoaded();
    return { chunks: chunks.length, ms: Date.now() - t0 };
  }

  /** 异步加载单个分类的索引（仅文本 + 倒排索引，不含 embedding），并发去重 */
  private async ensureCategoryLoaded(category: string): Promise<void> {
    if (this.categoryChunks.has(category)) return;
    const existing = this.categoryLoadInFlight.get(category);
    if (existing) return existing;
    const p = this.loadCategory(category);
    this.categoryLoadInFlight.set(category, p);
    try {
      await p;
    } finally {
      this.categoryLoadInFlight.delete(category);
    }
  }

  private async loadCategory(category: string): Promise<void> {
    if (this.categoryChunks.has(category)) return;
    const catPath = this.getCategoryIndexPath(category);

    if (fs.existsSync(catPath)) {
      try {
        const raw = await fsp.readFile(catPath, "utf-8");
        const parsed = JSON.parse(raw) as RagChunk[];
        const chunks = parsed.filter((c) => c?.content && String(c.content).trim().length > 0);
        const index = await buildInvertedIndexAsync(chunks); // 协作式，不冻结事件循环
        this.categoryChunks.set(category, chunks);
        this.categoryIndexes.set(category, index);
        return;
      } catch (e) {
        log.fail(`failed to load category index [${category}]`, e);
      }
    }
    // 回退：从主索引中过滤
    await this.ensureLoaded();
    if (this.chunks) {
      const filtered = this.chunks.filter((c) => c.metadata.category === category);
      this.categoryChunks.set(category, filtered);
      this.categoryIndexes.set(category, await buildInvertedIndexAsync(filtered));
    }
  }

  private async ensureLoaded(): Promise<void> {
    if (this.chunks) return;
    const cats = await this.getCategories();
    if (cats.length > 0) {
      this.chunks = [];
      return;
    }
    if (fs.existsSync(this.indexPath)) {
      try {
        const raw = await fsp.readFile(this.indexPath, "utf-8");
        const parsed = JSON.parse(raw) as RagChunk[];
        this.chunks = Array.isArray(parsed)
          ? parsed.filter((c) => c?.content && String(c.content).trim().length > 0)
          : [];
      } catch (e) {
        log.fail("failed to load RAG index", e);
        this.chunks = [];
      }
    } else {
      this.chunks = [];
    }
  }

  /** 预加载+缓存全库 chunks + 倒排索引（并发去重） */
  private async ensureAllLoaded(): Promise<{ chunks: RagChunk[]; index: InvertedIndex }> {
    if (this.allChunksCache && this.allIndexCache) {
      return { chunks: this.allChunksCache, index: this.allIndexCache };
    }
    if (this.allLoadInFlight) return this.allLoadInFlight;
    const p = this.loadAll();
    this.allLoadInFlight = p;
    try {
      return await p;
    } finally {
      this.allLoadInFlight = null;
    }
  }

  private async loadAll(): Promise<{ chunks: RagChunk[]; index: InvertedIndex }> {
    if (this.allChunksCache && this.allIndexCache) {
      return { chunks: this.allChunksCache, index: this.allIndexCache };
    }
    const cats = await this.getCategories();
    if (cats.length > 0) {
      const all: RagChunk[] = [];
      const embRef: { category: string; localIndex: number }[] = [];
      const allIndex: InvertedIndex = new Map();
      for (const cat of cats) {
        await this.ensureCategoryLoaded(cat);
        const c = this.categoryChunks.get(cat);
        if (c) {
          await this.ensureEmbeddingsLoaded(cat);
          // 用分类倒排索引按 offset 合并，避免对全库重新分词
          const catIdx = this.categoryIndexes.get(cat);
          if (catIdx) await mergeInvertedIndexInto(allIndex, catIdx, all.length);
          for (let j = 0; j < c.length; j++) embRef.push({ category: cat, localIndex: j });
          all.push(...c);
        }
      }
      this.allChunksCache = all;
      this.allEmbRefCache = embRef;
      this.allIndexCache = allIndex;
      return { chunks: all, index: allIndex };
    }
    await this.ensureLoaded();
    return { chunks: this.chunks || [], index: this.allIndexCache || new Map() };
  }

  /**
   * 加载指定分类子集：合并这几个分类的 chunks + 倒排索引 + embRef，按分类列表缓存。
   * 分类级 chunks/倒排索引复用 ensureCategoryLoaded 的缓存，仅子集的拼接/合并按需进行。
   */
  private async ensureSubsetLoaded(
    categories: string[],
  ): Promise<{ chunks: RagChunk[]; index: InvertedIndex; embRef: { category: string; localIndex: number }[] }> {
    const uniqueSorted = Array.from(new Set(categories)).sort();
    const key = uniqueSorted.join("\u0000");
    const cached = this.subsetCache.get(key);
    if (cached) {
      this.subsetCache.delete(key);
      this.subsetCache.set(key, cached); // 触摸为最近使用
      return cached;
    }

    const chunks: RagChunk[] = [];
    const embRef: { category: string; localIndex: number }[] = [];
    const index: InvertedIndex = new Map();
    for (const cat of uniqueSorted) {
      await this.ensureCategoryLoaded(cat);
      const c = this.categoryChunks.get(cat);
      if (!c || c.length === 0) continue;
      await this.ensureEmbeddingsLoaded(cat);
      const catIdx = this.categoryIndexes.get(cat);
      if (catIdx) await mergeInvertedIndexInto(index, catIdx, chunks.length);
      for (let j = 0; j < c.length; j++) embRef.push({ category: cat, localIndex: j });
      chunks.push(...c);
    }

    const result = { chunks, index, embRef };
    this.subsetCache.set(key, result);
    if (this.subsetCache.size > SUBSET_CACHE_MAX) {
      this.subsetCache.delete(this.subsetCache.keys().next().value as string);
    }
    return result;
  }

  /** 确保 .emb 已加载（延迟到语义搜索时才加载，getFullText 不触发） */
  private async ensureEmbeddingsLoaded(category: string): Promise<void> {
    if (!this.embStore.has(category)) return;
    if (this.embCategoryMap.has(category)) return; // 已加载
    await this.embStore.load(category);
    this.embCategoryMap.set(category, category);
  }

  /**
   * 按 pool 下标按需取 embedding（不再把全库向量灌入 JS 内存）。
   * - 指定分类：pool 即该分类 chunks，下标直接对应 .emb 顺序
   * - 全库：经 allEmbRefCache 映射回 (分类, 分类内下标)
   */
  private getPoolEmbedding(
    poolIndex: number,
    category: string | undefined,
    embRef: { category: string; localIndex: number }[] | null,
  ): number[] | null {
    if (category && category !== "全部") {
      return this.embStore.get(category, poolIndex);
    }
    const ref = embRef?.[poolIndex];
    if (!ref) return null;
    return this.embStore.get(ref.category, ref.localIndex);
  }

  async getEmbedding(text: string): Promise<number[]> {
    const apiKey = getEmbeddingApiKey();
    if (!apiKey) return [];
    const url = getEmbeddingsUrl();
    const model = getEmbeddingModel();
    const input = text.replace(/\n/g, " ").slice(0, 512);

    // 写作/检索预览常重复同一 query，缓存命中可省一次网络往返
    const cacheKey = `${model}\u0000${input}`;
    const cached = this.embQueryCache.get(cacheKey);
    if (cached) {
      this.embQueryCache.delete(cacheKey);
      this.embQueryCache.set(cacheKey, cached); // 触摸为最近使用
      return cached;
    }

    try {
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input }),
      });
      if (!response.ok) {
        const err = await response.text();
        log.warn("embedding API failed, lexical-only RAG", { detail: err.slice(0, 200) });
        return [];
      }
      const result = (await response.json()) as { data?: { embedding?: number[] }[] };
      const emb = result.data?.[0]?.embedding;
      if (Array.isArray(emb) && emb.length > 0) {
        this.embQueryCache.set(cacheKey, emb);
        if (this.embQueryCache.size > EMB_QUERY_CACHE_MAX) {
          this.embQueryCache.delete(this.embQueryCache.keys().next().value as string);
        }
        return emb;
      }
      return [];
    } catch (e) {
      log.fail("embedding generation error", e);
      return [];
    }
  }

  async search(
    query: string,
    options:
      | number
      | { limit?: number; category?: string; categories?: string[]; maxPerSource?: number } = {},
  ): Promise<RagChunk[]> {
    let limit = 8;
    let category: string | undefined;
    let categories: string[] | undefined;
    let maxPerSource = DEFAULT_MAX_PER_SOURCE;

    if (typeof options === "number") {
      limit = options;
    } else {
      limit = options.limit ?? 8;
      category = options.category;
      categories = options.categories;
      maxPerSource = options.maxPerSource ?? DEFAULT_MAX_PER_SOURCE;
    }

    const q = query.trim();
    if (!q) return [];

    // 分段计时（仅 RAG_PERF_LOG=1 时输出，生产可见）
    const perf = process.env.RAG_PERF_LOG === "1";
    const tStart = perf ? Date.now() : 0;
    let tAfterLoad = 0;
    let tAfterBm25 = 0;
    let tAfterEmbed = 0;
    let tAfterVec = 0;

    await ensureBibMapLoaded();

    let pool: RagChunk[];
    let idx: InvertedIndex | undefined;
    // 向量按需取：singleCat 走 embStore.get(cat, i)；否则用 embRef 映射回 (分类,下标)
    let singleCat: string | undefined;
    let poolEmbRef: { category: string; localIndex: number }[] | null = null;

    const scopeCats = categories?.filter((c) => c && c !== "全部");

    if (scopeCats && scopeCats.length > 0) {
      // 范围检索：只加载相关分类（如扩写按已选文献分类收敛），避免全库
      const sub = await this.ensureSubsetLoaded(scopeCats);
      pool = sub.chunks;
      idx = sub.index;
      poolEmbRef = sub.embRef;
    } else if (category && category !== "全部") {
      await this.ensureCategoryLoaded(category);
      pool = this.categoryChunks.get(category) || [];
      idx = this.categoryIndexes.get(category);
      // 延迟加载 embedding 以备向量检索（仅首次触发 I/O，按需切片不灌入内存）
      await this.ensureEmbeddingsLoaded(category);
      singleCat = category;
    } else {
      const { chunks, index } = await this.ensureAllLoaded();
      pool = chunks;
      idx = index;
      poolEmbRef = this.allEmbRefCache;
      if (pool.length === 0) {
        await this.ensureLoaded();
        pool = this.chunks || [];
      }
    }
    if (perf) tAfterLoad = Date.now();

    if (pool.length === 0) return [];

    const terms = extractQueryTerms(q);
    const bm25 = idx ? bm25FromIndex(idx, pool, terms) : new Array(pool.length).fill(0);
    if (perf) tAfterBm25 = Date.now();

    const queryVector = await this.getEmbedding(q);
    const hasVec = queryVector.length > 0;
    if (perf) tAfterEmbed = Date.now();

    // 两阶段：先用 BM25 召回候选，向量只在候选集上精排，避免全库 O(N) 余弦。
    // 仅当 BM25 完全无命中（如跨语种纯语义召回）时，才回退全库向量扫描。
    const vecScores = new Array(pool.length).fill(0);
    let hasUsefulVec = false;
    let vecScanCount = 0;
    if (hasVec) {
      const candidateCount = Math.max(limit * 20, 200);
      const candidates: number[] = [];
      for (const i of argsortDescending(bm25)) {
        if (bm25[i] <= 0) break;
        candidates.push(i);
        if (candidates.length >= candidateCount) break;
      }
      const targets = candidates.length > 0 ? candidates : pool.map((_, i) => i);
      vecScanCount = targets.length;
      for (const i of targets) {
        const emb = this.getPoolEmbedding(i, singleCat, poolEmbRef);
        if (emb && emb.length === queryVector.length) {
          const s = cosineSimilarity(queryVector, emb);
          vecScores[i] = s;
          if (s > 0.01) hasUsefulVec = true;
        }
      }
    }
    if (perf) tAfterVec = Date.now();

    let fused: number[];
    if (hasUsefulVec && terms.length > 0) {
      const rankB = ranksFromScores(bm25, true);
      const rankV = ranksFromScores(vecScores, true);
      fused = rrfFromRanks([rankB, rankV]);
    } else if (hasUsefulVec) {
      fused = rrfFromRanks([ranksFromScores(vecScores, true)]);
    } else {
      fused = bm25.map((s) => s);
    }

    const order = argsortDescending(fused);

    if (perf) {
      log.warn("rag.search timing", {
        category: category || "全部",
        poolSize: pool.length,
        terms: terms.length,
        vecScan: vecScanCount,
        hasVec,
        ms: {
          load: tAfterLoad - tStart,
          bm25: tAfterBm25 - tAfterLoad,
          embed: tAfterEmbed - tAfterBm25,
          vec: tAfterVec - tAfterEmbed,
          rank: Date.now() - tAfterVec,
          total: Date.now() - tStart,
        },
      });
    }

    const nonZero = order.filter((i) => fused[i] > 0);
    if (nonZero.length === 0) return [];
    const diversified = diversifyBySource(nonZero, pool, limit * 2, maxPerSource);
    const catDiversified = diversifyByCategory(diversified, pool);
    return catDiversified.slice(0, limit);
  }

  /** 按页码/chunkIndex 拼接全文（异步） */
  async getFullText(fileName: string): Promise<string> {
    const baseName = path.basename(fileName.replace(/\\/g, "/"));
    const matchesSource = (source: string) => {
      const normalized = path.basename(source.replace(/\\/g, "/"));
      return normalized === baseName || source === fileName;
    };

    const cats = await this.getCategories();
    if (cats.length > 0) {
      for (const cat of cats) {
        await this.ensureCategoryLoaded(cat);
        const catChunks = this.categoryChunks.get(cat);
        if (!catChunks) continue;
        const match = catChunks.filter((c) => matchesSource(c.metadata.source));
        if (match.length > 0) {
          const sorted = match.sort((a, b) => {
            const pa = a.metadata.pageStart ?? 0;
            const pb = b.metadata.pageStart ?? 0;
            if (pa !== pb) return pa - pb;
            return (a.metadata.chunkIndex ?? 0) - (b.metadata.chunkIndex ?? 0);
          });
          return sorted.map((c) => c.content).join("\n\n");
        }
      }
      return "";
    }
    await this.ensureLoaded();
    if (!this.chunks) return "";
    const list = this.chunks
      .filter((c) => matchesSource(c.metadata.source))
      .sort((a, b) => {
        const pa = a.metadata.pageStart ?? 0;
        const pb = b.metadata.pageStart ?? 0;
        if (pa !== pb) return pa - pb;
        return (a.metadata.chunkIndex ?? 0) - (b.metadata.chunkIndex ?? 0);
      });
    return list.map((c) => c.content).join("\n\n");
  }

  /** 异步重载 */
  async reload(): Promise<void> {
    this.chunks = null;
    this.categoryChunks.clear();
    this.categoryIndexes.clear();
    this.allChunksCache = null;
    this.allIndexCache = null;
    this.allEmbRefCache = null;
    this.allLoadInFlight = null;
    this.categoryLoadInFlight.clear();
    this.subsetCache.clear();
    this.embCategoryMap.clear();
    this.embStore.clear();
    await this.ensureLoaded();
  }
}

export const localRAG = new LocalRAG();

// ── 引用格式化 ────────────────────────────────────────────────────────────

export function cleanSourceName(raw: string): string {
  return raw.replace(/\.pdf$/i, "").replace(/[_-]/g, " ").replace(/\s+/g, " ").trim();
}

function sanitizeRagBib(bib: BibEntry["bib"] | undefined | null): BibEntry["bib"] | null {
  if (!bib) return null;
  const cleaned = { ...bib };
  if (cleaned.doi) {
    const m = cleaned.doi.match(/(10\.\d{4,}\/[^\s一-鿿"<>，。、；]+)/);
    cleaned.doi = m ? m[1].replace(/[.,;]+$/, "") : cleaned.doi.trim();
  }
  if (cleaned.title) {
    let t = cleaned.title;
    t = t.replace(/https?:\/\/[^\s]+/g, "");
    t = t.replace(/收稿日期[：:][^\n。]*/g, "");
    t = t.replace(/录用日期[：:][^\n。]*/g, "");
    t = t.replace(/作者简介[：:][^\n。]*/g, "");
    t = t.replace(/基金项目[：:（(][^\n。]*/g, "");
    t = t.replace(/随着[^。]{15,}/g, "");
    t = t.replace(/[\s]+/g, " ").trim();
    cleaned.title = t.length >= 2 ? t : undefined;
  }
  if (Array.isArray(cleaned.authors)) {
    cleaned.authors = cleaned.authors.filter((a) => a && a !== "CNKI" && a !== "cnki");
    if (cleaned.authors.length === 0) cleaned.authors = undefined;
  }
  if (cleaned.firstAuthor === "CNKI" || cleaned.firstAuthor === "cnki") {
    cleaned.firstAuthor = undefined;
  }
  return cleaned;
}

export function formatRagCitation(chunk: RagChunk): string {
  const bibEntry = resolveBibEntry(chunk.metadata.source);
  const bib = sanitizeRagBib(bibEntry?.bib);
  const docType = chunk.metadata.documentType || bibEntry?.documentType;
  const gbTag = bibEntry?.gbTag;
  const p = chunk.metadata.pageStart;
  const pageEnd = chunk.metadata.pageEnd;
  const pageStr = p != null
    ? ` | p. ${p}${pageEnd != null && pageEnd !== p ? `-${pageEnd}` : ""}`
    : "";

  if (docType === "patent") {
    if (bib?.patentNumber) {
      const inventor = bib.inventors?.[0] || bib.applicant || "";
      return `[P] 专利 ${bib.patentNumber}${inventor ? ` | ${inventor} 等` : ""}${bib.publicationDate ? ` (${bib.publicationDate})` : ""}`;
    }
    return `[P] 专利: ${cleanSourceName(chunk.metadata.source)}`;
  }

  if (docType === "book") {
    if (bib?.firstAuthor || bib?.title) {
      const author = bib.firstAuthor || "佚名";
      const year = bib.year ? ` (${bib.year})` : "";
      const title = bib.title ? ` ${bib.title}` : "";
      const pub = bib.publisher ? ` | ${bib.publisher}` : "";
      return `[M] ${author}${year}${title}${pub}${pageStr}`;
    }
    return `[M] ${cleanSourceName(chunk.metadata.source)}${pageStr}`;
  }

  if (bib?.firstAuthor || bib?.year || bib?.journal || bib?.doi) {
    const tag = gbTag ? `[${gbTag}] ` : "";
    const author = bib.firstAuthor
      ? `${bib.firstAuthor}${bib.authors && bib.authors.length > 1 ? " 等" : ""}`
      : "";
    const year = bib.year ? ` (${bib.year})` : "";
    const journal = bib.journal ? ` | ${bib.journal}` : "";
    const doi = bib.doi ? ` | DOI: ${bib.doi}` : "";
    const title = bib.title ? ` ${bib.title}` : "";
    return `${tag}${author}${year}${title}${journal}${doi}${pageStr}`.trim();
  }

  const src = cleanSourceName(chunk.metadata.source);
  if (p != null && pageEnd != null && pageEnd !== p) return `${src} (pp. ${p}-${pageEnd})`;
  if (p != null) return `${src} (p. ${p})`;
  return src;
}
