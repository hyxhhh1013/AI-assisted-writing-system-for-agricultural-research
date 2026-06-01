import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { fetchWithRetry } from "@/lib/fetch-with-retry";
import { cosineSimilarity } from "./similarity";

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
  private loaded = new Map<string, { buffer: Buffer; dim: number; count: number }>();

  /** 检查指定分类是否有 .emb 文件 */
  has(category: string): boolean {
    const p = this.embPath(category);
    return fs.existsSync(p);
  }

  /** 异步加载 .emb 文件 */
  async load(category: string): Promise<{ dim: number; count: number }> {
    if (this.loaded.has(category)) {
      const c = this.loaded.get(category)!;
      return { dim: c.dim, count: c.count };
    }
    const p = this.embPath(category);
    if (!fs.existsSync(p)) return { dim: 0, count: 0 };

    const buf = await fsp.readFile(p);
    if (buf.length < EMB_HEADER_SIZE) {
      console.error(`EmbeddingStore: ${p} too small (${buf.length} bytes)`);
      return { dim: 0, count: 0 };
    }

    const version = buf.readUInt32LE(0);
    const dim = buf.readUInt32LE(4);
    if (version !== 1) {
      console.error(`EmbeddingStore: unknown version ${version} in ${p}`);
      return { dim: 0, count: 0 };
    }

    const dataLen = buf.length - EMB_HEADER_SIZE;
    const count = Math.floor(dataLen / (dim * 4));

    this.loaded.set(category, { buffer: buf, dim, count });
    return { dim, count };
  }

  /** 获取指定索引的 embedding（返回 number[]，按需从 buffer 切片） */
  get(category: string, index: number): number[] | null {
    const entry = this.loaded.get(category);
    if (!entry || index < 0 || index >= entry.count) return null;

    const offset = EMB_HEADER_SIZE + index * entry.dim * 4;
    const arr = new Array<number>(entry.dim);
    for (let i = 0; i < entry.dim; i++) {
      arr[i] = entry.buffer.readFloatLE(offset + i * 4);
    }
    return arr;
  }

  /** 批量获取 embedding（比逐个调 get 更高效） */
  getBatch(category: string, indices: number[]): (number[] | null)[] {
    const entry = this.loaded.get(category);
    if (!entry) return indices.map(() => null);

    return indices.map((index) => {
      if (index < 0 || index >= entry.count) return null;
      const offset = EMB_HEADER_SIZE + index * entry.dim * 4;
      const arr = new Array<number>(entry.dim);
      for (let i = 0; i < entry.dim; i++) {
        arr[i] = entry.buffer.readFloatLE(offset + i * 4);
      }
      return arr;
    });
  }

  /** 卸载指定分类以释放内存 */
  unload(category: string): void {
    this.loaded.delete(category);
  }

  clear(): void {
    this.loaded.clear();
  }

  get size(): number {
    return this.loaded.size;
  }

  private embPath(category: string): string {
    return path.join(process.cwd(), `data/index_${category}.emb`);
  }
}

// ── 书目元数据懒加载 ────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");

let _bibMap: Map<string, BibEntry> | null = null;

export function resolveBibEntry(source: string): BibEntry | undefined {
  const map = getBibMap();
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

export function getBibMap(): Map<string, BibEntry> {
  if (_bibMap) return _bibMap;
  const metaPath = path.join(DATA_DIR, "metadata.json");
  try {
    if (!fs.existsSync(metaPath)) { _bibMap = new Map(); return _bibMap; }
    const raw: BibEntry[] = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
    const map = new Map<string, BibEntry>();
    for (const entry of raw) {
      if (!entry?.name) continue;
      const prev = map.get(entry.name);
      if (!prev) { map.set(entry.name, entry); continue; }
      const prevScore = (prev.documentType ? 1 : 0) + (prev.bib ? 2 : 0);
      const nextScore = (entry.documentType ? 1 : 0) + (entry.bib ? 2 : 0);
      map.set(entry.name, nextScore >= prevScore ? entry : prev);
    }
    _bibMap = map;
  } catch { _bibMap = new Map(); }
  return _bibMap;
}

export function invalidateBibCache(): void {
  _bibMap = null;
}

// ── 检索算法常量 ───────────────────────────────────────────────────────────

const RRF_K = 60;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const DEFAULT_MAX_PER_SOURCE = 4;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

function buildInvertedIndex(chunks: RagChunk[]): InvertedIndex {
  const idx: InvertedIndex = new Map();
  for (let i = 0; i < chunks.length; i++) {
    const tokens = chunks[i].content.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(Boolean);
    const tfMap = new Map<string, number>();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
      if (/[一-鿿]/.test(t)) {
        for (const ch of t) tfMap.set(ch, (tfMap.get(ch) || 0) + 1);
      }
    }
    for (const [term, tf] of tfMap) {
      if (!idx.has(term)) idx.set(term, new Map());
      idx.get(term)!.set(i, tf);
    }
  }
  return idx;
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

function diversifyByCategory(topChunks: RagChunk[], allChunks: RagChunk[], limit: number): RagChunk[] {
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
  private indexPath = path.join(process.cwd(), "data/index.json");
  private metadataPath = path.join(process.cwd(), "data/metadata.json");
  private embStore = new EmbeddingStore();

  private getCategoryIndexPath(category: string): string {
    return path.join(process.cwd(), `data/index_${category}.json`);
  }

  /** 列出所有可用的分类 */
  async getCategories(): Promise<string[]> {
    try {
      if (!fs.existsSync(this.metadataPath)) return [];
      const raw = await fsp.readFile(this.metadataPath, "utf-8");
      const meta = JSON.parse(raw) as { category: string }[];
      return Array.from(new Set(meta.map((m) => m.category))).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** 异步加载单个分类的索引（含 .emb 二进制嵌入） */
  private async ensureCategoryLoaded(category: string): Promise<void> {
    if (this.categoryChunks.has(category)) return;
    const catPath = this.getCategoryIndexPath(category);

    if (fs.existsSync(catPath)) {
      try {
        const raw = await fsp.readFile(catPath, "utf-8");
        const parsed = JSON.parse(raw) as RagChunk[];
        const chunks = parsed.filter((c) => c?.content && String(c.content).trim().length > 0);
        this.categoryChunks.set(category, chunks);
        this.categoryIndexes.set(category, buildInvertedIndex(chunks));

        // 预加载 .emb 文件（如果存在）
        if (this.embStore.has(category)) {
          await this.embStore.load(category);
          this.embCategoryMap.set(category, category);
        }
        return;
      } catch (e) {
        console.error(`Failed to load category index [${category}]:`, e);
      }
    }
    // 回退：从主索引中过滤
    await this.ensureLoaded();
    if (this.chunks) {
      const filtered = this.chunks.filter((c) => c.metadata.category === category);
      this.categoryChunks.set(category, filtered);
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
        console.error("Failed to load RAG index:", e);
        this.chunks = [];
      }
    } else {
      this.chunks = [];
    }
  }

  /** 预加载+缓存全库 chunks + 倒排索引 */
  private async ensureAllLoaded(): Promise<{ chunks: RagChunk[]; index: InvertedIndex }> {
    if (this.allChunksCache && this.allIndexCache) {
      return { chunks: this.allChunksCache, index: this.allIndexCache };
    }
    const cats = await this.getCategories();
    if (cats.length > 0) {
      const all: RagChunk[] = [];
      for (const cat of cats) {
        await this.ensureCategoryLoaded(cat);
        const c = this.categoryChunks.get(cat);
        if (c) {
          this.fillEmbeddings(c, cat);
          all.push(...c);
        }
      }
      this.allChunksCache = all;
      this.allIndexCache = buildInvertedIndex(all);
      return { chunks: all, index: this.allIndexCache };
    }
    await this.ensureLoaded();
    return { chunks: this.chunks || [], index: this.allIndexCache || new Map() };
  }

  /** 从 EmbeddingStore 为 chunk 填充 embedding 字段 */
  private fillEmbeddings(chunks: RagChunk[], category: string): void {
    if (!this.embStore.has(category)) return;
    for (let i = 0; i < chunks.length; i++) {
      if (chunks[i].embedding) continue;
      const emb = this.embStore.get(category, i);
      if (emb) chunks[i].embedding = emb;
    }
  }

  async getEmbedding(text: string): Promise<number[]> {
    const apiKey = getEmbeddingApiKey();
    if (!apiKey) return [];
    const url = getEmbeddingsUrl();
    const model = getEmbeddingModel();
    const input = text.replace(/\n/g, " ").slice(0, 512);
    try {
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model, input }),
      });
      if (!response.ok) {
        const err = await response.text();
        console.warn("Embedding API failed, lexical-only RAG:", err.slice(0, 200));
        return [];
      }
      const result = (await response.json()) as { data?: { embedding?: number[] }[] };
      const emb = result.data?.[0]?.embedding;
      return Array.isArray(emb) ? emb : [];
    } catch (e) {
      console.error("Embedding generation error:", e);
      return [];
    }
  }

  async search(
    query: string,
    options:
      | number
      | { limit?: number; category?: string; maxPerSource?: number } = {},
  ): Promise<RagChunk[]> {
    let limit = 8;
    let category: string | undefined;
    let maxPerSource = DEFAULT_MAX_PER_SOURCE;

    if (typeof options === "number") {
      limit = options;
    } else {
      limit = options.limit ?? 8;
      category = options.category;
      maxPerSource = options.maxPerSource ?? DEFAULT_MAX_PER_SOURCE;
    }

    const q = query.trim();
    if (!q) return [];

    let pool: RagChunk[];
    let idx: InvertedIndex | undefined;

    if (category && category !== "全部") {
      await this.ensureCategoryLoaded(category);
      pool = this.categoryChunks.get(category) || [];
      idx = this.categoryIndexes.get(category);
      // 填充 embedding 以备向量检索
      this.fillEmbeddings(pool, category);
    } else {
      const { chunks, index } = await this.ensureAllLoaded();
      pool = chunks;
      idx = index;
      if (pool.length === 0) {
        await this.ensureLoaded();
        pool = this.chunks || [];
      }
    }

    if (pool.length === 0) return [];

    const terms = extractQueryTerms(q);
    const bm25 = idx ? bm25FromIndex(idx, pool, terms) : new Array(pool.length).fill(0);

    const queryVector = await this.getEmbedding(q);
    const hasVec = queryVector.length > 0;

    const vecScores = pool.map((chunk) =>
      hasVec && chunk.embedding && chunk.embedding.length === queryVector.length
        ? cosineSimilarity(queryVector, chunk.embedding)
        : 0,
    );
    const hasUsefulVec = hasVec && vecScores.some((s) => s > 0.01);

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
    const nonZero = order.filter((i) => fused[i] > 0);
    if (nonZero.length === 0) return [];
    const diversified = diversifyBySource(nonZero, pool, limit * 2, maxPerSource);
    const catDiversified = diversifyByCategory(diversified, pool, limit);
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
