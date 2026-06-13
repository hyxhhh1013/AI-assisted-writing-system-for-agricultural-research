import type { KnowledgeBib } from "@/contracts/knowledge";
import { normalizeBibliographyDoi } from "@/lib/bib-import/doi";

const CROSSREF_TIMEOUT_MS = 12_000;

function pickYear(message: Record<string, unknown>): number | undefined {
  const issued = message.issued as { "date-parts"?: number[][] } | undefined;
  const dp = issued?.["date-parts"]?.[0]?.[0];
  if (typeof dp === "number" && dp >= 1000) return dp;
  const created = message.created as { "date-parts"?: number[][] } | undefined;
  const c = created?.["date-parts"]?.[0]?.[0];
  if (typeof c === "number" && c >= 1000) return c;
  return undefined;
}

function pickPages(message: Record<string, unknown>): string | undefined {
  const page = typeof message.page === "string" ? message.page.trim() : "";
  if (page) return page;
  const first = message["article-number"];
  return typeof first === "string" ? first.trim() : undefined;
}

function parseCrossrefAuthors(authors: unknown): string[] {
  if (!Array.isArray(authors)) return [];
  return authors
    .map((author) => {
      if (!author || typeof author !== "object") return "";
      const a = author as { given?: string; family?: string; name?: string };
      if (a.name) return a.name.trim();
      const parts = [a.given, a.family].filter(Boolean);
      return parts.join(" ").trim();
    })
    .filter(Boolean);
}

function shouldReplaceField(key: string, current: unknown, incoming: unknown): boolean {
  if (current == null || current === "") return true;
  if (key === "title") {
    const cur = String(current);
    const inc = String(incoming);
    if (cur.length < 10 && inc.length >= 10) return true;
    if (inc.length > cur.length * 1.3 && inc.length >= 15) return true;
    return false;
  }
  if (key === "firstAuthor") {
    const cur = String(current);
    if (cur.length > 24 || /\d/.test(cur)) return true;
    return false;
  }
  if (key === "journal") {
    const cur = String(current);
    const inc = String(incoming);
    if (cur.length <= 3 && inc.length > 3) return true;
    return false;
  }
  return false;
}

export function mergeBibliographyEnrichment(base: KnowledgeBib, enrichment: KnowledgeBib): KnowledgeBib {
  const out: KnowledgeBib = { ...base };
  for (const key of Object.keys(enrichment) as (keyof KnowledgeBib)[]) {
    const value = enrichment[key];
    if (value == null || value === "") continue;
    if (shouldReplaceField(key, out[key], value)) {
      Object.assign(out, { [key]: value });
    }
  }
  if (out.authors?.length && !out.firstAuthor) {
    out.firstAuthor = out.authors[0];
  }
  return out;
}

/** 按 DOI 从 Crossref 拉取书目元数据 */
export async function fetchCrossrefBib(doi: string): Promise<KnowledgeBib> {
  const normalized = normalizeBibliographyDoi(doi);
  if (!normalized) return {};

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CROSSREF_TIMEOUT_MS);
  try {
    const url = `https://api.crossref.org/works/${encodeURIComponent(normalized)}`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json", "User-Agent": "GrainScript/1.0 (mailto:support@grainscript.local)" },
    });
    if (!res.ok) return {};

    const json = (await res.json()) as { message?: Record<string, unknown> };
    const message = json.message;
    if (!message) return {};

    const titleList = message.title as string[] | undefined;
    const title = titleList?.[0]?.trim();
    const container = message["container-title"] as string[] | undefined;
    const journal = Array.isArray(container) ? container[0]?.trim() : undefined;
    const authors = parseCrossrefAuthors(message.author);

    const bib: KnowledgeBib = {
      doi: normalized,
      title: title || undefined,
      journal: journal || undefined,
      volume: message.volume != null ? String(message.volume) : undefined,
      issue: message.issue != null ? String(message.issue) : undefined,
      pages: pickPages(message),
      year: pickYear(message),
      authors: authors.length > 0 ? authors : undefined,
      firstAuthor: authors[0],
    };

    return Object.fromEntries(
      Object.entries(bib).filter(([, v]) => v != null && v !== ""),
    ) as KnowledgeBib;
  } catch {
    return {};
  } finally {
    clearTimeout(timer);
  }
}

/** 本地字段缺失时用 Crossref 补全 */
export async function enrichBibFromCrossref(bib: KnowledgeBib): Promise<KnowledgeBib> {
  if (!bib.doi) return bib;
  const needsEnrich =
    !bib.title
    || (!bib.firstAuthor && !(bib.authors && bib.authors.length > 0))
    || !bib.journal
    || !bib.year;
  if (!needsEnrich) return bib;

  const remote = await fetchCrossrefBib(bib.doi);
  if (Object.keys(remote).length === 0) return bib;
  return mergeBibliographyEnrichment(bib, remote);
}
