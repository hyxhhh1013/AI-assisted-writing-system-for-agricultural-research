/**
 * 本地库备文献：按「篇」排序。
 * 不写死学科黑名单——用当次命中集的 IDF：几乎每篇题名都有的词（热解/pyrolysis、生物炭/biochar）
 * 权重大幅降低，真正把篇与篇分开的是查询里的限定词（温度、预处理、催化…）。
 */

import { basenameKey } from "@/lib/agent/reading-pack";
import { isPlaceholderPaperTitle } from "@/lib/agent/core/title-prereq-consent";
import { tokenizeQuery } from "@/lib/agent/literature-relevance";
import { expandRagQueries } from "@/lib/rag-query-expand";
import type { RagChunk } from "@/lib/rag";
import { formatRagCitation, resolveBibEntry } from "@/lib/rag";

export const KNOWLEDGE_PAPER_CHUNK_LIMIT = 48;
export const KNOWLEDGE_PAPER_MAX_PER_SOURCE = 1;
/** 达到此篇数后禁止换关键词再搜，应立刻导入 */
export const KNOWLEDGE_SEARCH_ENOUGH_FILES = 8;
/** 某词出现在 ≥ 该比例的候选题名中，视为本库集合词，几乎不参与拉开名次 */
export const COLLECTION_TERM_DF = 0.5;

export interface RankedKnowledgePaper {
  source: string;
  category?: string;
  citation?: string;
  excerpt?: string;
  relevanceScore: number;
  why: string;
  chunkCount: number;
}

export interface KnowledgePaperRankResult {
  papers: RankedKnowledgePaper[];
  topicTooBroad: boolean;
  distinctiveTokens: string[];
}

function paperTitle(source: string, citation: string): string {
  const bib = resolveBibEntry(source)?.bib?.title?.trim();
  if (bib) return bib;
  const stripped = citation.replace(/^\[[^\]]+\]\s*/, "").trim();
  if (stripped.length >= 8) return stripped;
  return source.replace(/\.pdf$/i, "").replace(/.*[/\\]/, "");
}

const EXCERPT_JUNK =
  /参考文献|acknowledgements?|\[\s*crossref\s*\]|figure[\s-]*\d|van krevelen|https?:\/\//i;

function isBibLike(text: string): boolean {
  if (!text) return true;
  if (EXCERPT_JUNK.test(text)) return true;
  const years = text.match(/\b(19|20)\d{2}\b/g)?.length ?? 0;
  const etal = text.match(/\bet al\b/gi)?.length ?? 0;
  return years >= 4 || etal >= 2;
}

function pickPaperExcerpt(chunks: RagChunk[]): string | undefined {
  const scored = chunks.map((c) => {
    const sec = (c.metadata.section ?? "").toLowerCase();
    let s = 0;
    if (/abstract|introduction/.test(sec)) s += 6;
    if (isBibLike(c.content)) s -= 10;
    const n = c.content.trim().length;
    if (n >= 80 && n <= 1400) s += 2;
    else if (n > 2000) s -= 2;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  const best = scored[0]?.c.content.trim() ?? "";
  if (!best || isBibLike(best)) return undefined;
  return best.slice(0, 400);
}

/** 中文 2-gram 与英文同义词并存，不丢掉中文（否则「热解」只剩 pyrolysis，整库打满分）。 */
export function queryKnowledgeTokens(query: string): string[] {
  const zh = tokenizeQuery(query);
  const en: string[] = [];
  for (const variant of expandRagQueries(query)) {
    for (const t of tokenizeQuery(variant)) {
      if (/[a-z]/i.test(t) && t.length >= 4) en.push(t);
    }
  }
  return [...new Set([...zh, ...en])];
}

function titleHaystack(title: string, source: string): string {
  return `${title} ${source}`.toLowerCase();
}

function tokenWeight(df: number, n: number): number {
  if (n <= 0) return 1;
  const frac = df / n;
  if (frac >= COLLECTION_TERM_DF) return 0.1;
  return Math.log((n + 1) / (df + 1));
}

export function composeKnowledgeSearchQuery(
  query: string,
  title?: string,
  researchDirection?: string,
): string {
  const q = query.trim();
  const topicParts: string[] = [];
  if (!isPlaceholderPaperTitle(title)) {
    topicParts.push((title ?? "").trim().slice(0, 48));
  }
  const dir = (researchDirection ?? "").trim();
  if (dir.length >= 2 && !isPlaceholderPaperTitle(dir)) {
    topicParts.push(dir.slice(0, 24));
  }
  const topic = topicParts.join(" ").trim();
  if (!topic) return q;
  if (!q) return topic;

  const qTok = new Set(tokenizeQuery(q));
  const tTok = tokenizeQuery(topic);
  if (tTok.length === 0) return q;
  const overlap = tTok.filter((t) => qTok.has(t) || q.toLowerCase().includes(t)).length;
  if (overlap / tTok.length >= 0.35) return q;
  return `${q} ${topic}`.trim();
}

export function rankKnowledgePapers(
  chunks: RagChunk[],
  query: string,
): RankedKnowledgePaper[] {
  return rankKnowledgePapersDetailed(chunks, query).papers;
}

export function rankKnowledgePapersDetailed(
  chunks: RagChunk[],
  query: string,
): KnowledgePaperRankResult {
  const groups = new Map<string, { chunks: RagChunk[]; firstRank: number }>();
  chunks.forEach((c, i) => {
    const key = basenameKey(c.metadata.source);
    if (!key) return;
    const g = groups.get(key);
    if (!g) groups.set(key, { chunks: [c], firstRank: i });
    else g.chunks.push(c);
  });

  const tokens = queryKnowledgeTokens(query);
  const drafts: Array<{
    source: string;
    category?: string;
    citation: string;
    excerpt?: string;
    title: string;
    hay: string;
    chunkCount: number;
    firstRank: number;
  }> = [];
  for (const [, g] of groups) {
    const best = g.chunks[0]!;
    const source = best.metadata.source;
    const citation = formatRagCitation(best);
    const title = paperTitle(source, citation);
    drafts.push({
      source,
      category: best.metadata.category,
      citation,
      excerpt: pickPaperExcerpt(g.chunks),
      title,
      hay: titleHaystack(title, source),
      chunkCount: g.chunks.length,
      firstRank: g.firstRank,
    });
  }

  const n = drafts.length;
  const df = new Map<string, number>();
  for (const tok of tokens) {
    df.set(tok, drafts.filter((d) => d.hay.includes(tok)).length);
  }
  const weights = new Map<string, number>();
  for (const tok of tokens) {
    weights.set(tok, tokenWeight(df.get(tok) ?? 0, n));
  }
  const distinctiveTokens = tokens.filter((t) => (weights.get(t) ?? 0) > 0.35);

  const papers: RankedKnowledgePaper[] = drafts.map((d) => {
    let num = 0;
    let den = 0;
    const matched: string[] = [];
    for (const tok of tokens) {
      const w = weights.get(tok) ?? 1;
      den += w;
      if (d.hay.includes(tok)) {
        num += w * 2;
        matched.push(tok);
      } else if (d.excerpt && !isBibLike(d.excerpt) && d.excerpt.toLowerCase().includes(tok)) {
        num += w * 0.2;
        matched.push(tok);
      }
    }
    const lexical = den > 0 ? num / (den * 2) : 0;
    const rankBonus = Math.max(0, 0.06 * (1 - d.firstRank / Math.max(chunks.length, 1)));
    const score = Math.min(1, Math.max(0, Math.round((lexical + rankBonus) * 100) / 100));
    const why =
      distinctiveTokens.length === 0
        ? "查询词在本库多数文献题名中都会出现，相关度拉不开，请补限定词后再导入"
        : matched.length > 0
          ? `题名命中：${[...new Set(matched)].slice(0, 8).join("、")}`
          : "题名未命中限定词，相关度偏低";
    return {
      source: d.source,
      category: d.category,
      citation: d.citation,
      excerpt: d.excerpt,
      relevanceScore: score,
      why,
      chunkCount: d.chunkCount,
    };
  });

  papers.sort((a, b) => b.relevanceScore - a.relevanceScore || a.source.localeCompare(b.source));

  const scores = papers.map((p) => p.relevanceScore);
  const max = scores[0] ?? 0;
  const min = scores[scores.length - 1] ?? 0;
  const topicTooBroad =
    n >= 6 && (distinctiveTokens.length === 0 || max - min < 0.08);

  return { papers, topicTooBroad, distinctiveTokens };
}

export function suggestedKnowledgeIndices(
  files: { relevanceScore?: number }[],
  topicTooBroad = false,
): number[] {
  if (files.length === 0) return [];
  if (topicTooBroad) {
    return files.slice(0, Math.min(5, files.length)).map((_, i) => i + 1);
  }
  const scores = files.map((f) => f.relevanceScore ?? 0);
  const max = Math.max(0, ...scores);
  if (max <= 0) return files.slice(0, Math.min(8, files.length)).map((_, i) => i + 1);
  const cutoff = Math.max(0.18, max * 0.72);
  return files
    .map((f, i) => ({ i: i + 1, s: f.relevanceScore ?? 0 }))
    .filter((x) => x.s >= cutoff)
    .slice(0, 12)
    .map((x) => x.i);
}
