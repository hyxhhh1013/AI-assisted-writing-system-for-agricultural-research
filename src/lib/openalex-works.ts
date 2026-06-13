import type { JournalMetrics, KnowledgeBib } from "@/contracts/knowledge";

export interface OpenAlexEnrichment {
  metrics: Partial<JournalMetrics>;
  bibPatch?: Pick<KnowledgeBib, "issn" | "eissn">;
}

function pickIssn(source: Record<string, unknown> | null | undefined): string | undefined {
  if (!source) return undefined;
  const raw = source.issn_l ?? source.issn;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].trim();
  return undefined;
}

/** 按 DOI 查询 OpenAlex，补 citedBy / OA / ISSN（不含 JCR IF） */
export async function fetchOpenAlexWorkByDoi(doi: string): Promise<OpenAlexEnrichment | null> {
  const id = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  if (!id) return null;

  const mailto = process.env.OPENALEX_MAILTO?.trim();
  const url = new URL(`https://api.openalex.org/works/doi:${encodeURIComponent(id)}`);
  if (mailto) url.searchParams.set("mailto", mailto);

  const res = await fetch(url.toString(), {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(12_000),
  });
  if (!res.ok) return null;

  const work = (await res.json()) as Record<string, unknown>;
  const openAccess = work.open_access as Record<string, unknown> | undefined;
  const primary = work.primary_location as Record<string, unknown> | undefined;
  const source = primary?.source as Record<string, unknown> | undefined;

  const metrics: Partial<JournalMetrics> = {};
  if (typeof work.cited_by_count === "number") {
    metrics.citedByCount = work.cited_by_count;
  }
  const oaUrl = openAccess?.oa_url;
  if (typeof oaUrl === "string" && oaUrl.trim()) {
    metrics.openAccessUrl = oaUrl.trim();
  }

  const issn = pickIssn(source);
  const bibPatch: Pick<KnowledgeBib, "issn" | "eissn"> = {};
  if (issn) bibPatch.issn = issn;

  return {
    metrics,
    bibPatch: Object.keys(bibPatch).length > 0 ? bibPatch : undefined,
  };
}
