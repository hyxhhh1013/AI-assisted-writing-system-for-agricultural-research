import type { ExternalLiteratureHit, LiteratureSource } from "@/contracts/literature";
import { expandRagQueries } from "@/lib/rag-query-expand";

const TIMEOUT_MS = 12_000;
/** 单源软超时：慢源（如 S2 限流）不拖垮整轮；硬超时仍由 fetch AbortSignal 兜底 */
const SOURCE_SOFT_MS = 3_000;
const SOURCE_PRIORITY: Record<LiteratureSource, number> = {
  openalex: 4,
  "semantic-scholar": 3,
  crossref: 2,
  pubmed: 1,
};

function fetchWithTimeout(url: string, ms = TIMEOUT_MS): Promise<Response | null> {
  return fetch(url, {
    headers: { "User-Agent": "GrainScript/1.0 (literature-search)" },
    signal: AbortSignal.timeout(ms),
  }).catch(() => null);
}

async function withSoftTimeout<T>(
  promise: Promise<T>,
  ms: number,
  fallback: T,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** 从用户输入提取 DOI（含 doi.org URL） */
export function parseDoiFromQuery(raw: string): string | null {
  const trimmed = raw.trim();
  const urlMatch = trimmed.match(/doi\.org\/(10\.\S+)/i);
  if (urlMatch) return urlMatch[1].replace(/[.,;]+$/, "");
  const bare = trimmed.match(/^(?:doi[:\s]*)?(10\.\d{4,}\/[^\s]+)/i);
  return bare ? bare[1].replace(/[.,;]+$/, "") : null;
}

function normalizeTitleKey(title: string): string {
  return title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function mergeHits(hits: ExternalLiteratureHit[]): ExternalLiteratureHit[] {
  const byKey = new Map<string, ExternalLiteratureHit>();

  for (const hit of hits) {
    const key = hit.doi?.toLowerCase() || normalizeTitleKey(hit.title);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...hit, sources: [hit.source] });
      continue;
    }

    const sources = new Set<LiteratureSource>([...(existing.sources ?? [existing.source]), hit.source]);
    const pick = SOURCE_PRIORITY[hit.source] >= SOURCE_PRIORITY[existing.source] ? hit : existing;
    const other = pick === hit ? existing : hit;

    byKey.set(key, {
      ...pick,
      authors: pick.authors.length > 0 ? pick.authors : other.authors,
      journal: pick.journal || other.journal,
      doi: pick.doi || other.doi,
      url: pick.url || other.url,
      abstract: pick.abstract || other.abstract,
      citedByCount: pick.citedByCount ?? other.citedByCount,
      openAccessUrl: pick.openAccessUrl || other.openAccessUrl,
      isOpenAccess: pick.isOpenAccess || other.isOpenAccess,
      volume: pick.volume || other.volume,
      issue: pick.issue || other.issue,
      pages: pick.pages || other.pages,
      year: pick.year ?? other.year,
      sources: [...sources],
    });
  }

  return [...byKey.values()];
}

// ── Semantic Scholar ────────────────────────────────────────────────────────

interface SemanticScholarPaper {
  paperId?: string;
  title?: string;
  authors?: { name?: string }[];
  year?: number;
  url?: string;
  abstract?: string;
  externalIds?: { DOI?: string };
  journal?: { name?: string };
  citationCount?: number;
  openAccessPdf?: { url?: string };
}

async function searchSemanticScholar(query: string, limit: number): Promise<ExternalLiteratureHit[]> {
  const fields = "title,authors,year,url,abstract,externalIds,journal,citationCount,openAccessPdf";
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=${fields}`;
  const res = await fetchWithTimeout(url);
  if (!res?.ok) return [];

  const data = (await res.json()) as { data?: SemanticScholarPaper[] };
  return (data.data ?? []).map((p) => {
    const doi = p.externalIds?.DOI;
    return {
      id: doi ? `doi:${doi}` : `s2:${p.paperId ?? p.title ?? "unknown"}`,
      title: p.title ?? "Unknown",
      authors: (p.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
      year: p.year,
      journal: p.journal?.name,
      doi,
      url: p.url,
      abstract: p.abstract,
      citedByCount: p.citationCount,
      openAccessUrl: p.openAccessPdf?.url,
      isOpenAccess: !!p.openAccessPdf?.url,
      source: "semantic-scholar" as const,
    };
  });
}

// ── CrossRef ──────────────────────────────────────────────────────────────────

interface CrossRefItem {
  DOI?: string;
  title?: string[];
  author?: { given?: string; family?: string }[];
  published?: { "date-parts"?: number[][] };
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  URL?: string;
  abstract?: string;
  "is-referenced-by-count"?: number;
}

async function searchCrossRef(query: string, limit: number): Promise<ExternalLiteratureHit[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;
  const res = await fetchWithTimeout(url);
  if (!res?.ok) return [];

  const data = (await res.json()) as { message?: { items?: CrossRefItem[] } };
  return (data.message?.items ?? []).map((item) => {
    const doi = item.DOI;
    const title = item.title?.[0] ?? "Unknown";
    return {
      id: doi ? `doi:${doi}` : `crossref:${normalizeTitleKey(title)}`,
      title,
      authors: (item.author ?? []).map((a) => `${a.given ?? ""} ${a.family ?? ""}`.trim()).filter(Boolean),
      year: item.published?.["date-parts"]?.[0]?.[0],
      journal: item["container-title"]?.[0],
      volume: item.volume,
      issue: item.issue,
      pages: item.page,
      doi,
      url: item.URL ?? (doi ? `https://doi.org/${doi}` : undefined),
      abstract: typeof item.abstract === "string" ? item.abstract.replace(/<[^>]+>/g, "") : undefined,
      citedByCount: item["is-referenced-by-count"],
      source: "crossref" as const,
    };
  });
}

// ── OpenAlex ──────────────────────────────────────────────────────────────────

/** OpenAlex 摘要为倒排索引，需还原为纯文本（导出供单测） */
export function reconstructOpenAlexAbstract(
  inverted: unknown,
): string | undefined {
  if (!inverted || typeof inverted !== "object") return undefined;
  const words: { pos: number; word: string }[] = [];
  for (const [word, positions] of Object.entries(inverted as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const pos of positions) {
      if (typeof pos === "number") words.push({ pos, word });
    }
  }
  if (words.length === 0) return undefined;
  words.sort((a, b) => a.pos - b.pos);
  return words.map((w) => w.word).join(" ").trim() || undefined;
}

function openAlexWorkToHit(work: Record<string, unknown>, fallbackId: string): ExternalLiteratureHit {
  const authorships = (work.authorships as { author?: { display_name?: string } }[] | undefined) ?? [];
  const authors = authorships
    .map((a) => a.author?.display_name ?? "")
    .filter(Boolean);

  const primary = work.primary_location as Record<string, unknown> | undefined;
  const source = primary?.source as Record<string, unknown> | undefined;
  const biblio = work.biblio as Record<string, unknown> | undefined;
  const openAccess = work.open_access as Record<string, unknown> | undefined;

  const doiRaw = work.doi;
  const doi =
    typeof doiRaw === "string"
      ? doiRaw.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim()
      : undefined;

  const firstPage = biblio?.first_page;
  const lastPage = biblio?.last_page;
  const pages =
    typeof firstPage === "string"
      ? lastPage && lastPage !== firstPage
        ? `${firstPage}-${lastPage}`
        : firstPage
      : undefined;

  const oaUrl = openAccess?.oa_url;
  const openAlexId = typeof work.id === "string" ? work.id.split("/").pop() ?? fallbackId : fallbackId;
  const abstract =
    typeof work.abstract === "string"
      ? work.abstract
      : reconstructOpenAlexAbstract(work.abstract_inverted_index);

  return {
    id: doi ? `doi:${doi}` : `openalex:${openAlexId}`,
    title: (work.display_name as string) ?? (work.title as string) ?? "Unknown",
    authors,
    year: typeof work.publication_year === "number" ? work.publication_year : undefined,
    journal: typeof source?.display_name === "string" ? source.display_name : undefined,
    volume: typeof biblio?.volume === "string" ? biblio.volume : undefined,
    issue: typeof biblio?.issue === "string" ? biblio.issue : undefined,
    pages,
    doi,
    url: typeof work.id === "string" ? work.id : doi ? `https://doi.org/${doi}` : undefined,
    abstract,
    citedByCount: typeof work.cited_by_count === "number" ? work.cited_by_count : undefined,
    openAccessUrl: typeof oaUrl === "string" ? oaUrl : undefined,
    isOpenAccess: openAccess?.is_oa === true,
    source: "openalex",
  };
}

async function searchOpenAlex(query: string, limit: number): Promise<ExternalLiteratureHit[]> {
  const mailto = process.env.OPENALEX_MAILTO?.trim();
  const url = new URL("https://api.openalex.org/works");
  url.searchParams.set("search", query);
  url.searchParams.set("per-page", String(limit));
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetchWithTimeout(url.toString());
  if (!res?.ok) return [];

  const data = (await res.json()) as { results?: Record<string, unknown>[] };
  return (data.results ?? []).map((work, i) => openAlexWorkToHit(work, `oa-search-${i}`));
}

async function fetchOpenAlexByDoi(doi: string): Promise<ExternalLiteratureHit | null> {
  const mailto = process.env.OPENALEX_MAILTO?.trim();
  const url = new URL(`https://api.openalex.org/works/doi:${encodeURIComponent(doi)}`);
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetchWithTimeout(url.toString(), 12_000);
  if (!res?.ok) return null;

  const work = (await res.json()) as Record<string, unknown>;
  return openAlexWorkToHit(work, doi);
}

// ── PubMed ────────────────────────────────────────────────────────────────────

interface PubMedSummaryResult {
  uid?: string;
  title?: string;
  authors?: { name?: string }[];
  source?: string;
  pubdate?: string;
  articleids?: { idtype?: string; value?: string }[];
}

async function searchPubMed(query: string, limit: number): Promise<ExternalLiteratureHit[]> {
  const searchUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi");
  searchUrl.searchParams.set("db", "pubmed");
  searchUrl.searchParams.set("term", query);
  searchUrl.searchParams.set("retmode", "json");
  searchUrl.searchParams.set("retmax", String(limit));

  const searchRes = await fetchWithTimeout(searchUrl.toString());
  if (!searchRes?.ok) return [];

  const searchData = (await searchRes.json()) as {
    esearchresult?: { idlist?: string[] };
  };
  const ids = searchData.esearchresult?.idlist ?? [];
  if (ids.length === 0) return [];

  const summaryUrl = new URL("https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi");
  summaryUrl.searchParams.set("db", "pubmed");
  summaryUrl.searchParams.set("id", ids.join(","));
  summaryUrl.searchParams.set("retmode", "json");

  const summaryRes = await fetchWithTimeout(summaryUrl.toString());
  if (!summaryRes?.ok) return [];

  const summaryData = (await summaryRes.json()) as {
    result?: Record<string, PubMedSummaryResult | string>;
  };
  const result = summaryData.result ?? {};

  const hits: ExternalLiteratureHit[] = [];
  for (const pmid of ids) {
    const item = result[pmid];
    if (!item || typeof item === "string") continue;

    const doiEntry = item.articleids?.find((a) => a.idtype?.toLowerCase() === "doi");
    const doi = doiEntry?.value;
    const yearMatch = item.pubdate?.match(/\d{4}/);
    const year = yearMatch ? Number(yearMatch[0]) : undefined;

    hits.push({
      id: doi ? `doi:${doi}` : `pubmed:${pmid}`,
      title: item.title ?? "Unknown",
      authors: (item.authors ?? []).map((a) => a.name ?? "").filter(Boolean),
      year,
      journal: item.source,
      doi,
      url: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      source: "pubmed",
    });
  }
  return hits;
}

export type ExternalSearchOptions = {
  limit?: number;
  /**
   * full：四源；fast：先 OpenAlex+S2，不够再补 CrossRef/PubMed（默认，Agent/UI 更快）
   */
  mode?: "fast" | "full";
};

const EMPTY_SOURCE_COUNTS: Record<string, number> = {
  openalex: 0,
  "semantic-scholar": 0,
  crossref: 0,
  pubmed: 0,
};

function bumpCounts(
  counts: Record<string, number>,
  batches: Partial<Record<LiteratureSource, ExternalLiteratureHit[]>>,
): void {
  for (const [src, hits] of Object.entries(batches)) {
    counts[src] = (counts[src] ?? 0) + (hits?.length ?? 0);
  }
}

/** 对多个 query 变体并行打指定源（单源软超时，避免慢源拖垮） */
async function searchVariantsOnSources(
  variants: string[],
  perSource: number,
  sources: readonly LiteratureSource[],
): Promise<{
  hits: ExternalLiteratureHit[];
  sourceCounts: Record<string, number>;
}> {
  const sourceCounts = { ...EMPTY_SOURCE_COUNTS };

  const buckets = await Promise.all(
    variants.map(async (q) => {
      const tasks: Promise<{ src: LiteratureSource; hits: ExternalLiteratureHit[] }>[] = [];
      if (sources.includes("openalex")) {
        tasks.push(
          withSoftTimeout(
            searchOpenAlex(q, perSource).then((hits) => ({
              src: "openalex" as const,
              hits,
            })),
            SOURCE_SOFT_MS,
            { src: "openalex" as const, hits: [] as ExternalLiteratureHit[] },
          ).catch(() => ({ src: "openalex" as const, hits: [] as ExternalLiteratureHit[] })),
        );
      }
      if (sources.includes("semantic-scholar")) {
        tasks.push(
          withSoftTimeout(
            searchSemanticScholar(q, perSource).then((hits) => ({
              src: "semantic-scholar" as const,
              hits,
            })),
            SOURCE_SOFT_MS,
            { src: "semantic-scholar" as const, hits: [] as ExternalLiteratureHit[] },
          ).catch(() => ({
            src: "semantic-scholar" as const,
            hits: [] as ExternalLiteratureHit[],
          })),
        );
      }
      if (sources.includes("crossref")) {
        tasks.push(
          withSoftTimeout(
            searchCrossRef(q, perSource).then((hits) => ({
              src: "crossref" as const,
              hits,
            })),
            SOURCE_SOFT_MS,
            { src: "crossref" as const, hits: [] as ExternalLiteratureHit[] },
          ).catch(() => ({ src: "crossref" as const, hits: [] as ExternalLiteratureHit[] })),
        );
      }
      if (sources.includes("pubmed")) {
        tasks.push(
          withSoftTimeout(
            searchPubMed(q, perSource).then((hits) => ({
              src: "pubmed" as const,
              hits,
            })),
            SOURCE_SOFT_MS,
            { src: "pubmed" as const, hits: [] as ExternalLiteratureHit[] },
          ).catch(() => ({ src: "pubmed" as const, hits: [] as ExternalLiteratureHit[] })),
        );
      }
      return Promise.all(tasks);
    }),
  );

  const all: ExternalLiteratureHit[] = [];
  for (const wave of buckets) {
    const batch: Partial<Record<LiteratureSource, ExternalLiteratureHit[]>> = {};
    for (const { src, hits } of wave) {
      batch[src] = hits;
      all.push(...hits);
    }
    bumpCounts(sourceCounts, batch);
  }
  return { hits: all, sourceCounts };
}

async function searchKeywordLiterature(
  query: string,
  limit: number,
  mode: "fast" | "full",
): Promise<{
  hits: ExternalLiteratureHit[];
  variants: string[];
  sourceCounts: Record<string, number>;
}> {
  const variants = buildExternalQueryVariants(query);
  const perSource = Math.max(5, Math.ceil(limit / Math.max(1, variants.length)));

  if (mode === "full") {
    const wave = await searchVariantsOnSources(variants, perSource, [
      "openalex",
      "semantic-scholar",
      "crossref",
      "pubmed",
    ]);
    return {
      hits: mergeHits(wave.hits).slice(0, limit),
      variants,
      sourceCounts: wave.sourceCounts,
    };
  }

  // fast：先主源（变体全部并行），不够再补次源
  const primary = await searchVariantsOnSources(variants, perSource, [
    "openalex",
    "semantic-scholar",
  ]);
  let merged = mergeHits(primary.hits);
  const sourceCounts = { ...primary.sourceCounts };

  if (merged.length < limit) {
    const secondary = await searchVariantsOnSources(variants, perSource, [
      "crossref",
      "pubmed",
    ]);
    sourceCounts.crossref += secondary.sourceCounts.crossref;
    sourceCounts.pubmed += secondary.sourceCounts.pubmed;
    merged = mergeHits([...primary.hits, ...secondary.hits]);
  }

  return {
    hits: merged.slice(0, limit),
    variants,
    sourceCounts,
  };
}

async function resolveDoiHits(
  doi: string,
  limit: number,
): Promise<ExternalLiteratureHit[]> {
  const [oa, cr] = await Promise.all([
    fetchOpenAlexByDoi(doi).catch(() => null),
    searchCrossRef(doi, 3).catch(() => [] as ExternalLiteratureHit[]),
  ]);
  const hits: ExternalLiteratureHit[] = [];
  if (oa) hits.push(oa);
  hits.push(...cr.filter((h) => h.doi?.toLowerCase() === doi.toLowerCase()));
  if (hits.length === 0) {
    const crFallback =
      cr.length > 0 ? cr : await searchCrossRef(`doi:${doi}`, 2).catch(() => []);
    hits.push(...crFallback);
  }
  return mergeHits(hits).slice(0, limit);
}

/** 聚合外部文献检索（OpenAlex + Semantic Scholar + CrossRef + PubMed） */
export async function searchExternalLiterature(
  rawQuery: string,
  options?: ExternalSearchOptions,
): Promise<ExternalLiteratureHit[]> {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 25);
  const mode = options?.mode ?? "fast";
  const query = rawQuery.replace(/[\s\n\r]+/g, " ").trim().slice(0, 300);
  if (query.length < 2) return [];

  const doi = parseDoiFromQuery(query);
  if (doi) return resolveDoiHits(doi, limit);

  const { hits } = await searchKeywordLiterature(query, limit, mode);
  return hits;
}

/** 供 Agent 诊断：各源是否返回（变体并行，不再串行） */
export async function searchExternalLiteratureWithStats(
  rawQuery: string,
  options?: ExternalSearchOptions,
): Promise<{
  hits: ExternalLiteratureHit[];
  variants: string[];
  sourceCounts: Record<string, number>;
}> {
  const limit = Math.min(Math.max(options?.limit ?? 10, 1), 25);
  const mode = options?.mode ?? "fast";
  const query = rawQuery.replace(/[\s\n\r]+/g, " ").trim().slice(0, 300);
  if (query.length < 2) {
    return { hits: [], variants: [], sourceCounts: { ...EMPTY_SOURCE_COUNTS } };
  }

  const doi = parseDoiFromQuery(query);
  if (doi) {
    const hits = await resolveDoiHits(doi, limit);
    return {
      hits,
      variants: [query],
      sourceCounts: {
        ...EMPTY_SOURCE_COUNTS,
        openalex: hits.filter((h) => h.source === "openalex").length,
        crossref: hits.filter((h) => h.source === "crossref").length,
      },
    };
  }

  return searchKeywordLiterature(query, limit, mode);
}

/**
 * 中文检索补英文同义。有英文变体时只走英文（最多 2 路），跳过中文垫底——
 * OpenAlex 中文常跑偏，且多一路变体≈多等一整轮网络。
 */
function buildExternalQueryVariants(query: string): string[] {
  if (!/[一-龥]/.test(query)) return [query];

  const enFirst: string[] = [];

  for (const v of expandRagQueries(query)) {
    if (/[a-zA-Z]{3,}/.test(v) && !enFirst.includes(v) && v !== query) {
      enFirst.push(v);
    }
  }

  const fallbacks: Array<[RegExp, string]> = [
    [/生物炭/, "biochar"],
    [/热解|裂解/, "pyrolysis"],
    [/土壤/, "soil"],
    [/控释|缓释/, "controlled release fertilizer"],
    [/烟草|烤烟/, "tobacco"],
    [/茶|绿茶/, "tea aroma"],
  ];
  const enParts: string[] = [];
  for (const [re, en] of fallbacks) {
    if (re.test(query)) enParts.push(en);
  }
  if (enParts.length > 0) {
    const enQ = enParts.join(" ");
    if (!enFirst.includes(enQ)) enFirst.unshift(enQ);
  }

  if (enFirst.length > 0) return enFirst.slice(0, 2);
  return [query];
}

export function literatureSourcesQueried(): LiteratureSource[] {
  return ["openalex", "semantic-scholar", "crossref", "pubmed"];
}
