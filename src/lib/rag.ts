import fs from "fs";
import path from "path";
import { fetchWithRetry } from "@/lib/fetch-with-retry";

/** 单条索引块（与 data/index.json 一致，metadata 可扩展） */
export interface RagChunk {
  content: string;
  embedding?: number[];
  metadata: {
    source: string;
    category: string;
    id: string;
    /** 索引进度：起始页（1-based），可选 */
    pageStart?: number;
    pageEnd?: number;
    chunkIndex?: number;
  };
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
  const base = (process.env.RAG_EMBEDDING_API_BASE || "https://api.deepseek.com/v1").replace(/\/$/, "");
  return `${base}/embeddings`;
}

function getEmbeddingModel(): string {
  return process.env.RAG_EMBEDDING_MODEL?.trim() || "deepseek-embed";
}

function getEmbeddingApiKey(): string | undefined {
  return process.env.RAG_EMBEDDING_API_KEY?.trim() || process.env.DEEPSEEK_API_KEY?.trim();
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

function termFrequency(docLower: string, term: string): number {
  if (!term) return 0;
  try {
    const re = new RegExp(escapeRegExp(term.toLowerCase()), "g");
    return (docLower.match(re) || []).length;
  } catch {
    return docLower.includes(term.toLowerCase()) ? 1 : 0;
  }
}

function documentFrequency(chunks: RagChunk[], term: string): number {
  const tl = term.toLowerCase();
  let df = 0;
  for (const c of chunks) {
    if (c.content.toLowerCase().includes(tl)) df++;
  }
  return df;
}

/** Okapi BM25，按块为「文档」；适合中英混合关键词检索 */
function bm25Scores(chunks: RagChunk[], terms: string[]): number[] {
  const N = chunks.length;
  if (N === 0 || terms.length === 0) return chunks.map(() => 0);
  const docLens = chunks.map((c) => Math.max(1, c.content.length));
  const avgdl = docLens.reduce((a, b) => a + b, 0) / N;

  const idf = new Map<string, number>();
  for (const t of terms) {
    const df = documentFrequency(chunks, t);
    idf.set(t, Math.log((N - df + 0.5) / (df + 0.5) + 1));
  }

  return chunks.map((chunk, idx) => {
    const docLower = chunk.content.toLowerCase();
    const dl = docLens[idx];
    let s = 0;
    for (const t of terms) {
      const tf = termFrequency(docLower, t);
      if (tf === 0) continue;
      const idfT = idf.get(t) ?? 0;
      const denom = tf + BM25_K1 * (1 - BM25_B + BM25_B * (dl / avgdl));
      s += idfT * ((tf * (BM25_K1 + 1)) / denom);
    }
    return s;
  });
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

function diversifyBySource(
  order: number[],
  chunks: RagChunk[],
  limit: number,
  maxPerSource: number,
): RagChunk[] {
  const perSource = new Map<string, number>();
  const out: RagChunk[] = [];
  for (const idx of order) {
    const src = chunks[idx].metadata.source || "unknown";
    const c = (perSource.get(src) ?? 0) + 1;
    if (c > maxPerSource) continue;
    perSource.set(src, c);
    out.push(chunks[idx]);
    if (out.length >= limit) break;
  }
  return out;
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < vecA.length; i++) {
    dot += vecA[i] * vecB[i];
    na += vecA[i] * vecA[i];
    nb += vecB[i] * vecB[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

export class LocalRAG {
  private chunks: RagChunk[] | null = null;
  private indexPath = path.join(process.cwd(), "data/index.json");

  private ensureLoaded() {
    if (this.chunks) return;
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
    const input = text.replace(/\n/g, " ").slice(0, 8000);

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

    this.ensureLoaded();
    if (!this.chunks || this.chunks.length === 0) return [];

    let pool = this.chunks;
    if (category && category !== "全部") {
      pool = this.chunks.filter((c) => c.metadata.category === category);
    }
    if (pool.length === 0) return [];

    const terms = extractQueryTerms(q);
    const bm25 = bm25Scores(pool, terms);

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
    // 过滤掉零分结果（完全不相关的块不应参与去重和返回）
    const nonZero = order.filter((i) => fused[i] > 0);
    if (nonZero.length === 0) return [];
    const diversified = diversifyBySource(nonZero, pool, limit * 2, maxPerSource);
    return diversified.slice(0, limit);
  }

  /** 按页码 / chunkIndex 拼接，便于全文分析顺序正确 */
  getFullText(fileName: string): string {
    this.ensureLoaded();
    if (!this.chunks) return "";
    const list = this.chunks
      .filter((c) => c.metadata.source === fileName)
      .sort((a, b) => {
        const pa = a.metadata.pageStart ?? 0;
        const pb = b.metadata.pageStart ?? 0;
        if (pa !== pb) return pa - pb;
        return (a.metadata.chunkIndex ?? 0) - (b.metadata.chunkIndex ?? 0);
      });
    return list.map((c) => c.content).join("\n\n");
  }

  reload() {
    this.chunks = null;
    this.ensureLoaded();
  }
}

export const localRAG = new LocalRAG();

/** 供 API 拼上下文：带文献名与可选页码 */
export function formatRagCitation(chunk: RagChunk): string {
  const src = chunk.metadata.source;
  const p = chunk.metadata.pageStart;
  if (p != null && chunk.metadata.pageEnd != null && chunk.metadata.pageEnd !== p) {
    return `${src} (pp. ${p}-${chunk.metadata.pageEnd})`;
  }
  if (p != null) return `${src} (p. ${p})`;
  return src;
}
