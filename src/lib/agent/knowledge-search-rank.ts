/**
 * 本地库备文献：按「篇」排序，而不是按 RAG 片段先到先得。
 * 片段检索默认每篇 4 段、一共 12 条 → 大约 3 篇 PDF，Agent 只好连搜。
 */

import { basenameKey } from "@/lib/agent/reading-pack";
import {
  MIN_IMPORT_RELEVANCE,
  scoreLiteratureRelevance,
  tokenizeQuery,
} from "@/lib/agent/literature-relevance";
import type { RagChunk } from "@/lib/rag";
import { formatRagCitation, resolveBibEntry } from "@/lib/rag";

export const KNOWLEDGE_PAPER_CHUNK_LIMIT = 48;
export const KNOWLEDGE_PAPER_MAX_PER_SOURCE = 1;
export const MIN_KNOWLEDGE_PAPER_RELEVANCE = MIN_IMPORT_RELEVANCE;
/** 达到此篇数后禁止换关键词再搜，应立刻导入 */
export const KNOWLEDGE_SEARCH_ENOUGH_FILES = 8;

export interface RankedKnowledgePaper {
  source: string;
  category?: string;
  citation?: string;
  excerpt?: string;
  relevanceScore: number;
  why: string;
  chunkCount: number;
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

function pickPaperExcerpt(chunks: RagChunk[]): string | undefined {
  const scored = chunks.map((c) => {
    const sec = (c.metadata.section ?? "").toLowerCase();
    let s = 0;
    if (/abstract|introduction/.test(sec)) s += 6;
    if (EXCERPT_JUNK.test(c.content)) s -= 10;
    const n = c.content.trim().length;
    if (n >= 80 && n <= 1400) s += 2;
    else if (n > 2000) s -= 2;
    return { c, s };
  });
  scored.sort((a, b) => b.s - a.s);
  return scored[0]?.c.content.trim().slice(0, 400);
}

/** 查询是制炭/热解时，纯应用/催化/茶学篇降权 */
const DRIFT_HINTS: Array<{ paper: RegExp; needInQuery: RegExp }> = [
  { paper: /缓释肥|控释肥|fertilizer/i, needInQuery: /缓释|控释|肥|fertilizer/i },
  { paper: /催化剂|catalyst|镍基|负载/i, needInQuery: /催化|catalyst|镍|负载/i },
  { paper: /土壤改良|soil amendment|碳固定/i, needInQuery: /土壤|soil|固碳|sequestr/i },
  { paper: /茶园|萎凋|茶叶|茶学/i, needInQuery: /茶|tea|wither/i },
  { paper: /烟草|nicotine/i, needInQuery: /烟|tobacco|nicotine/i },
];

function driftPenalty(titleAndSource: string, query: string): number {
  let p = 0;
  for (const h of DRIFT_HINTS) {
    if (h.paper.test(titleAndSource) && !h.needInQuery.test(query)) p += 0.28;
  }
  return p;
}

export function composeKnowledgeSearchQuery(
  query: string,
  title?: string,
  researchDirection?: string,
): string {
  const q = query.trim();
  const topicParts: string[] = [];
  const t = (title ?? "").trim();
  if (t && !/^(未命名(论文|项目)?|新项目|untitled)/i.test(t)) {
    topicParts.push(t.slice(0, 48));
  }
  const dir = (researchDirection ?? "").trim();
  if (dir.length >= 2) topicParts.push(dir.slice(0, 24));
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
  const groups = new Map<string, { chunks: RagChunk[]; firstRank: number }>();
  chunks.forEach((c, i) => {
    const key = basenameKey(c.metadata.source);
    if (!key) return;
    const g = groups.get(key);
    if (!g) groups.set(key, { chunks: [c], firstRank: i });
    else g.chunks.push(c);
  });

  const papers: RankedKnowledgePaper[] = [];
  for (const [, g] of groups) {
    const best = g.chunks[0]!;
    const source = best.metadata.source;
    const citation = formatRagCitation(best);
    const excerpt = pickPaperExcerpt(g.chunks);
    const title = paperTitle(source, citation);
    const rel = scoreLiteratureRelevance(query, {
      title,
      abstract: excerpt,
      journal: best.metadata.category,
    });
    const rankBonus = Math.max(0, 0.12 * (1 - g.firstRank / Math.max(chunks.length, 1)));
    const penalty = driftPenalty(`${title} ${source}`, query);
    const score = Math.min(1, Math.max(0, Math.round((rel.score + rankBonus - penalty) * 100) / 100));
    papers.push({
      source,
      category: best.metadata.category,
      citation,
      excerpt,
      relevanceScore: score,
      why: rel.why,
      chunkCount: g.chunks.length,
    });
  }

  papers.sort((a, b) => b.relevanceScore - a.relevanceScore || a.source.localeCompare(b.source));

  const strong = papers.filter((p) => p.relevanceScore >= MIN_KNOWLEDGE_PAPER_RELEVANCE);
  if (strong.length >= 4) return strong;
  return papers;
}

export function suggestedKnowledgeIndices(files: { relevanceScore?: number }[]): number[] {
  const strong = files
    .map((f, i) => ({ i: i + 1, s: f.relevanceScore ?? 0 }))
    .filter((x) => x.s >= MIN_KNOWLEDGE_PAPER_RELEVANCE);
  if (strong.length >= 4) return strong.slice(0, 15).map((x) => x.i);
  return files.slice(0, Math.min(15, files.length)).map((_, i) => i + 1);
}
