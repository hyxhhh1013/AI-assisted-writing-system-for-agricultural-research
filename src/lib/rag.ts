import fs from "fs";
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
    documentType?: string; // "journal" | "patent" | "book" | ...
    /** 索引进度：起始页（1-based），可选 */
    pageStart?: number;
    pageEnd?: number;
    chunkIndex?: number;
  };
}

/** metadata.json 中每条文献的书目元数据 */
export interface BibEntry {
  name: string;
  path?: string;
  category: string;
  chunkCount: number;
  documentType?: string;
  gbTag?: string;         // GB/T 7714 类型标识：J / M / P / D / C / S
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
    // 专利专用
    patentNumber?: string;
    inventors?: string[];
    applicant?: string;
    publicationDate?: string;
    // 书籍专用
    isbn?: string;
    publisher?: string;
  } | null;
}

// ── 书目元数据懒加载 ────────────────────────────────────────────────────────

const DATA_DIR = path.resolve(process.cwd(), "data");

let _bibMap: Map<string, BibEntry> | null = null;

/** 从 source（文件名或相对路径）查找书目条目 */
export function resolveBibEntry(source: string): BibEntry | undefined {
  const map = getBibMap();
  // 1) 精确匹配（含 .pdf）
  const direct = map.get(source);
  if (direct) return direct;
  // 2) 仅匹配 basename
  const base = path.basename(source.replace(/\\/g, "/"));
  const byBase = map.get(base);
  if (byBase) return byBase;
  // 3) 兼容历史数据：去掉 .pdf 的 cleaned name → 加回 .pdf 重试
  if (!source.endsWith(".pdf")) {
    const withPdf = map.get(source + ".pdf");
    if (withPdf) return withPdf;
    const baseWithPdf = map.get(base + ".pdf");
    if (baseWithPdf) return baseWithPdf;
  }
  return undefined;
}

/** 懒加载 metadata.json → filename → BibEntry 字典（生产中只加载一次） */
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
      if (!prev) {
        map.set(entry.name, entry);
        continue;
      }
      const prevScore = (prev.documentType ? 1 : 0) + (prev.bib ? 2 : 0);
      const nextScore = (entry.documentType ? 1 : 0) + (entry.bib ? 2 : 0);
      map.set(entry.name, nextScore >= prevScore ? entry : prev);
    }
    _bibMap = map;
  } catch {
    _bibMap = new Map();
  }
  return _bibMap;
}

/** 触发下次调用重新加载（reindex 后调用） */
export function invalidateBibCache(): void {
  _bibMap = null;
}

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
  return ""; // 未配置 embedding 服务
}

function getEmbeddingModel(): string {
  return process.env.RAG_EMBEDDING_MODEL?.trim() || "";
}

function getEmbeddingApiKey(): string | undefined {
  // 只有显式配置了 embedding URL/API_BASE 或专用 key 才启用向量检索
  // DeepSeek 没有公开的 embedding API，不要用 DEEPSEEK_API_KEY 去撞
  return process.env.RAG_EMBEDDING_API_KEY?.trim()
    || (process.env.RAG_EMBEDDINGS_URL?.trim() ? process.env.DEEPSEEK_API_KEY?.trim() : undefined)
    || (process.env.RAG_EMBEDDING_API_BASE?.trim() ? process.env.DEEPSEEK_API_KEY?.trim() : undefined)
    || undefined;
}

function extractQueryTerms(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const keywords: string[] = [];
  if (/[\u4e00-\u9fa5]/.test(q)) {
    const segments = q
      .toLowerCase()
      .split(/[^\u4e00-\u9fa5a-z0-9]+/i)
      .filter((s) => s.length >= 1);
    for (const seg of segments) {
      if (/[\u4e00-\u9fa5]/.test(seg)) {
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

// ── 倒排索引：term → Map<chunkIdx, tf> ──
// 构建在分类加载时，替换 O(N×T) 全扫描

type InvertedIndex = Map<string, Map<number, number>>;

/** 为 chunks 构建倒排索引 */
function buildInvertedIndex(chunks: RagChunk[]): InvertedIndex {
  const idx: InvertedIndex = new Map();
  for (let i = 0; i < chunks.length; i++) {
    const tokens = chunks[i].content.toLowerCase().split(/[^a-z0-9一-鿿]+/).filter(Boolean);
    const tfMap = new Map<string, number>();
    for (const t of tokens) {
      tfMap.set(t, (tfMap.get(t) || 0) + 1);
      // 中文单字也索引
      if (/[一-鿿]/.test(t)) {
        for (const ch of t) {
          tfMap.set(ch, (tfMap.get(ch) || 0) + 1);
        }
      }
    }
    for (const [term, tf] of tfMap) {
      if (!idx.has(term)) idx.set(term, new Map());
      idx.get(term)!.set(i, tf);
    }
  }
  return idx;
}

/** BM25 从倒排索引计算，仅遍历命中文档 */
function bm25FromIndex(
  idx: InvertedIndex,
  chunks: RagChunk[],
  terms: string[],
): number[] {
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
      const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl));
      scores[chunkIdx] += idf * ((tf * (BM25_K1 + 1)) / denom);
    }
  }
  return Array.from(scores);
}

function argsortDescending(scores: number[]): number[] {
  return scores
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.i);
}

/** 将得分转为名次（1 = 最高）；得分为 0 的并列给较大名次，降低 RRF 权重 */
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

/** 分类去偏：如果 Top-K 全来自同一分类，从其他分类补入最高分结果 */
function diversifyByCategory(
  topChunks: RagChunk[],
  allChunks: RagChunk[],
  limit: number,
): RagChunk[] {
  if (topChunks.length < 3) return topChunks;
  const topCats = new Set(topChunks.map(c => c.metadata.category));
  if (topCats.size >= 2) return topChunks; // 已有 ≥2 个分类
  // 从其他分类找最高分 chunk，替换最后一条
  const otherChunks = allChunks.filter(c => !topCats.has(c.metadata.category) && !topChunks.includes(c));
  if (otherChunks.length === 0) return topChunks;
  const result = topChunks.slice(0, -1);
  result.push(otherChunks[0]);
  return result;
}

function diversifyBySource(
  order: number[],
  chunks: RagChunk[],
  limit: number,
  maxPerSource: number,
): RagChunk[] {
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

export class LocalRAG {
  private chunks: RagChunk[] | null = null;
  private categoryChunks = new Map<string, RagChunk[]>();
  private categoryIndexes = new Map<string, InvertedIndex>(); // 倒排索引缓存
  private allChunksCache: RagChunk[] | null = null;
  private allIndexCache: InvertedIndex | null = null; // 全库倒排索引
  private indexPath = path.join(process.cwd(), "data/index.json");
  private metadataPath = path.join(process.cwd(), "data/metadata.json");

  private getCategoryIndexPath(category: string): string {
    return path.join(process.cwd(), `data/index_${category}.json`);
  }

  /** 列出所有可用的分类（从 metadata.json 读取，不加载大索引） */
  getCategories(): string[] {
    if (!fs.existsSync(this.metadataPath)) return [];
    try {
      const meta = JSON.parse(fs.readFileSync(this.metadataPath, "utf-8")) as { category: string }[];
      return Array.from(new Set(meta.map((m) => m.category))).filter(Boolean);
    } catch {
      return [];
    }
  }

  /** 按需加载单个分类的索引（懒加载，不重复解析） */
  private ensureCategoryLoaded(category: string) {
    if (this.categoryChunks.has(category)) return;
    const catPath = this.getCategoryIndexPath(category);
    // 尝试分类拆分索引，不存在则回退到主索引中过滤
    if (fs.existsSync(catPath)) {
      try {
        const raw = fs.readFileSync(catPath, "utf-8");
        const parsed = JSON.parse(raw) as RagChunk[];
        const chunks = parsed.filter((c) => c?.content && String(c.content).trim().length > 0);
        this.categoryChunks.set(category, chunks);
        this.categoryIndexes.set(category, buildInvertedIndex(chunks));
        return;
      } catch (e) {
        console.error(`Failed to load category index [${category}]:`, e);
      }
    }
    // 回退：从主索引中过滤出对应分类
    this.ensureLoaded();
    if (this.chunks) {
      const filtered = this.chunks.filter((c) => c.metadata.category === category);
      this.categoryChunks.set(category, filtered);
    }
  }

  private ensureLoaded() {
    if (this.chunks) return;
    // 优先尝试加载分类拆分索引的元数据
    const cats = this.getCategories();
    if (cats.length > 0) {
      // 有分类拆分索引时，不加载主索引，按需加载各分类
      this.chunks = []; // 标记已初始化，走懒加载路径
      return;
    }
    // 回退：加载单体 index.json
    if (fs.existsSync(this.indexPath)) {
      try {
        const raw = fs.readFileSync(this.indexPath, "utf-8");
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

  /**
   * 查询向量：无 Key 或失败时返回空数组，检索自动退化为 BM25。
   */
  async getEmbedding(text: string): Promise<number[]> {
    const apiKey = getEmbeddingApiKey();
    if (!apiKey) return [];

    const url = getEmbeddingsUrl();
    const model = getEmbeddingModel();
    const input = text.replace(/\n/g, " ").slice(0, 512);

    try {
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
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

  /**
   * 混合检索：BM25 +（可选）向量 RRF 融合，并按文献名做上限去重，避免 TopK 被单篇占满。
   */
  async search(
    query: string,
    options:
      | number
      | {
          limit?: number;
          category?: string;
          /** 同一 source 最多入选条数，默认 4 */
          maxPerSource?: number;
        } = {},
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

    // 有分类过滤 → 懒加载对应分类索引
    if (category && category !== "全部") {
      this.ensureCategoryLoaded(category);
      pool = this.categoryChunks.get(category) || [];
      idx = this.categoryIndexes.get(category);
    } else {
      // 无分类过滤 → 使用缓存的全库 chunks + 倒排索引
      const { chunks, index } = this.ensureAllLoaded();
      pool = chunks;
      idx = index;
      if (pool.length === 0) {
        this.ensureLoaded();
        pool = this.chunks || [];
      }
    }

    if (pool.length === 0) return [];

    const terms = extractQueryTerms(q);
    const bm25 = idx
      ? bm25FromIndex(idx, pool, terms)
      : new Array(pool.length).fill(0);

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
    // 分类去偏：确保 Top-K 覆盖 ≥2 个分类
    const catDiversified = diversifyByCategory(diversified, pool, limit);
    return catDiversified.slice(0, limit);
  }

  /** 按页码 / chunkIndex 拼接，便于全文分析顺序正确 */
  getFullText(fileName: string): string {
    const baseName = path.basename(fileName.replace(/\\/g, "/"));
    const matchesSource = (source: string) => {
      const normalized = path.basename(source.replace(/\\/g, "/"));
      return normalized === baseName || source === fileName;
    };

    // 优先从分类拆分索引中查找（支持按分类拆分的索引结构）
    const cats = this.getCategories();
    if (cats.length > 0) {
      for (const cat of cats) {
        this.ensureCategoryLoaded(cat);
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
    // 回退：主索引
    this.ensureLoaded();
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

  /** 预加载+缓存全库 chunks + 倒排索引（无分类过滤搜索的性能关键） */
  private ensureAllLoaded(): { chunks: RagChunk[]; index: InvertedIndex } {
    if (this.allChunksCache && this.allIndexCache) {
      return { chunks: this.allChunksCache, index: this.allIndexCache };
    }
    const cats = this.getCategories();
    if (cats.length > 0) {
      const all: RagChunk[] = [];
      for (const cat of cats) {
        this.ensureCategoryLoaded(cat);
        const c = this.categoryChunks.get(cat);
        if (c) all.push(...c);
      }
      this.allChunksCache = all;
      this.allIndexCache = buildInvertedIndex(all);
      return { chunks: all, index: this.allIndexCache };
    }
    this.ensureLoaded();
    return { chunks: this.chunks || [], index: this.allIndexCache || new Map() };
  }

  reload() {
    this.chunks = null;
    this.categoryChunks.clear();
    this.categoryIndexes.clear();
    this.allChunksCache = null;
    this.allIndexCache = null;
    this.ensureLoaded();
  }
}

export const localRAG = new LocalRAG();

/** 清理 RAG 来源文件名，去除 .pdf 等后缀，生成可读的引用标识 */
export function cleanSourceName(raw: string): string {
  return raw
    .replace(/\.pdf$/i, "")
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 供 API 拼上下文：优先使用结构化书目元数据，无则退化到文件名+页码。
 *
 * 有 bib 时输出格式（便于 AI 生成 GB/T 7714 / Vancouver / APA 条目）：
 *   [J] Khan MA et al. (2008) 营养浸渍木炭... | p. 3
 *   [P] 专利: CN102345678A | 申请人: 某公司
 *   [M] 张三 (2020) 农业生物技术导论 | 出版社: 科学出版社
 */
/** 清洗 bib 字段（与 ref-format.ts sanitizeBib 同逻辑，内联避免循环依赖） */
function sanitizeRagBib(bib: BibEntry["bib"] | undefined | null): BibEntry["bib"] | null {
  if (!bib) return null;
  const cleaned = { ...bib };
  // DOI 清洗：只保留标准 DOI 格式
  if (cleaned.doi) {
    const m = cleaned.doi.match(/(10\.\d{4,}\/[^\s一-鿿"<>，。、；]+)/);
    cleaned.doi = m ? m[1].replace(/[.,;]+$/, "") : cleaned.doi.trim();
  }
  // Title 清洗：去除 URL/收稿日期/作者简介/摘要
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
  // Authors 清洗：过滤 CNKI
  if (Array.isArray(cleaned.authors)) {
    cleaned.authors = cleaned.authors.filter(a => a && a !== "CNKI" && a !== "cnki");
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

  // ── 专利 ────────────────────────────────────────────────────────────────
  if (docType === "patent") {
    if (bib?.patentNumber) {
      const inventor = bib.inventors?.[0] || bib.applicant || "";
      return `[P] 专利 ${bib.patentNumber}${inventor ? ` | ${inventor} 等` : ""}${bib.publicationDate ? ` (${bib.publicationDate})` : ""}`;
    }
    return `[P] 专利: ${cleanSourceName(chunk.metadata.source)}`;
  }

  // ── 书籍 ────────────────────────────────────────────────────────────────
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

  // ── 期刊论文（默认）────────────────────────────────────────────────────
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

  // ── 兜底：文件名 + 页码 ────────────────────────────────────────────────
  const src = cleanSourceName(chunk.metadata.source);
  if (p != null && pageEnd != null && pageEnd !== p) {
    return `${src} (pp. ${p}-${pageEnd})`;
  }
  if (p != null) return `${src} (p. ${p})`;
  return src;
}
