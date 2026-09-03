import type { ExternalLiteratureHit, LiteratureSource } from "@/contracts/literature";
import { LITERATURE_SOURCES } from "@/contracts/literature";
import { externalLiteratureHitSchema } from "@/lib/validations";

const SOURCE_SET = new Set<string>(LITERATURE_SOURCES);

function asSource(raw: unknown): LiteratureSource {
  return typeof raw === "string" && SOURCE_SET.has(raw)
    ? (raw as LiteratureSource)
    : "openalex";
}

function asStringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
}

/**
 * 把确认卡 params.importItems 收成可展示的文献。
 * 优先走正式 schema；缺 id/source 的历史快照也能展开标题和摘要。
 */
export function parseImportConfirmItems(raw: unknown): ExternalLiteratureHit[] {
  if (!Array.isArray(raw)) return [];
  const out: ExternalLiteratureHit[] = [];
  for (const item of raw) {
    const parsed = externalLiteratureHitSchema.safeParse(item);
    if (parsed.success) {
      out.push(parsed.data);
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    if (!title) continue;
    const doi = typeof o.doi === "string" ? o.doi.trim() : "";
    const id =
      typeof o.id === "string" && o.id.trim()
        ? o.id.trim()
        : doi
          ? `doi:${doi}`
          : `tmp:${out.length}`;
    out.push({
      id,
      title,
      authors: asStringList(o.authors),
      year: typeof o.year === "number" && Number.isFinite(o.year) ? o.year : undefined,
      journal: typeof o.journal === "string" ? o.journal : undefined,
      doi: doi || undefined,
      url: typeof o.url === "string" ? o.url : undefined,
      abstract: typeof o.abstract === "string" ? o.abstract : undefined,
      citedByCount:
        typeof o.citedByCount === "number" && Number.isFinite(o.citedByCount)
          ? o.citedByCount
          : undefined,
      openAccessUrl: typeof o.openAccessUrl === "string" ? o.openAccessUrl : undefined,
      isOpenAccess: o.isOpenAccess === true,
      source: asSource(o.source),
    });
  }
  return out;
}

/** 打开原文：OA PDF > DOI > 来源页 */
export function literatureLandingUrl(hit: ExternalLiteratureHit): string | null {
  if (hit.openAccessUrl?.trim()) return hit.openAccessUrl.trim();
  const doi = hit.doi?.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").trim();
  if (doi) return `https://doi.org/${doi}`;
  if (hit.url?.trim()) return hit.url.trim();
  return null;
}

export const IMPORT_SOURCE_LABELS: Record<string, string> = {
  openalex: "OpenAlex",
  "semantic-scholar": "S2",
  crossref: "CrossRef",
  pubmed: "PubMed",
};
