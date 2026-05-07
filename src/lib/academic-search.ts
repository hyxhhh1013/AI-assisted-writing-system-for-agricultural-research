// 公开学术搜索引擎 API 封装
// Semantic Scholar（免费，限 100 req/5min）+ CrossRef（备选）

export interface AcademicSearchResult {
  title: string;
  authors: string[];
  year?: number;
  url: string;
  abstract?: string;
  snippet: string;
  score: number;
  source: "semantic-scholar" | "crossref";
}

const TIMEOUT_MS = 5000;

async function fetchWithTimeout(url: string, ms = TIMEOUT_MS): Promise<Response | null> {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), ms);
    const res = await fetch(url, {
      headers: { "User-Agent": "ThesisAssistant/1.0" },
      signal: controller.signal,
    });
    clearTimeout(id);
    return res;
  } catch {
    return null;
  }
}

/** Semantic Scholar 搜索 */
async function searchSemanticScholar(query: string, limit = 5): Promise<AcademicSearchResult[]> {
  const url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,authors,year,url,abstract`;

  const res = await fetchWithTimeout(url);
  if (!res?.ok) return [];

  try {
    const data = await res.json();
    return (data.data ?? []).map((p: any) => ({
      title: p.title ?? "Unknown",
      authors: (p.authors ?? []).map((a: any) => a.name),
      year: p.year,
      url: p.url ?? "",
      abstract: p.abstract ?? undefined,
      snippet: p.abstract ?? p.title ?? "",
      score: 1,
      source: "semantic-scholar" as const,
    }));
  } catch {
    return [];
  }
}

/** CrossRef 搜索 */
async function searchCrossRef(query: string, limit = 3): Promise<AcademicSearchResult[]> {
  const url = `https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}`;

  const res = await fetchWithTimeout(url);
  if (!res?.ok) return [];

  try {
    const data = await res.json();
    const items = data.message?.items ?? [];
    return items.map((item: any) => ({
      title: item.title?.[0] ?? "Unknown",
      authors: (item.author ?? []).map((a: any) => `${a.given ?? ""} ${a.family ?? ""}`.trim()),
      year: item.published?.["date-parts"]?.[0]?.[0],
      url: item.URL ?? "",
      snippet: item.abstract ?? item.title?.[0] ?? "",
      score: 0.8,
      source: "crossref" as const,
    }));
  } catch {
    return [];
  }
}

/** 对文本片段进行联网学术搜索 */
export async function searchAcademic(text: string, limit = 5): Promise<AcademicSearchResult[]> {
  const query = text.replace(/[\s\n\r]+/g, " ").slice(0, 150);

  // 两个搜索并行，任一失败不影响另一个
  const [ssResults, crResults] = await Promise.all([
    searchSemanticScholar(query, limit).catch(() => [] as AcademicSearchResult[]),
    searchCrossRef(query, Math.max(2, Math.floor(limit / 2))).catch(() => [] as AcademicSearchResult[]),
  ]);

  // 合并去重
  const all = [...ssResults, ...crResults];
  const seen = new Set<string>();
  return all.filter((r) => {
    const key = r.title.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
