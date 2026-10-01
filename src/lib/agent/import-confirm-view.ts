import type { ExternalLiteratureHit, LiteratureSource } from "@/contracts/literature";
import { LITERATURE_SOURCES } from "@/contracts/literature";
import { externalLiteratureHitSchema } from "@/lib/validations";

/** 对口 = 课题词在标题或 DOI 一致；边缘 = 只在摘要命中或未命中 */
export type ImportTopicFit = "aligned" | "marginal";

export interface ImportConfirmItem extends ExternalLiteratureHit {
  why?: string;
  relevanceScore?: number;
  topicFit?: ImportTopicFit;
  /** 摘要是 OA/DOI 首段摘录，不是检索自带的全文摘要 */
  abstractExcerpt?: boolean;
}

export const TOPIC_FIT_LABEL: Record<ImportTopicFit, string> = {
  aligned: "对口",
  marginal: "边缘",
};

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

function readDisplayFields(
  raw: unknown,
): Pick<ImportConfirmItem, "why" | "relevanceScore" | "topicFit" | "abstractExcerpt"> {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const why = typeof o.why === "string" ? o.why.trim() : "";
  const score = typeof o.relevanceScore === "number" && Number.isFinite(o.relevanceScore)
    ? o.relevanceScore
    : undefined;
  const topicFit = o.topicFit === "aligned" || o.topicFit === "marginal" ? o.topicFit : undefined;
  return {
    ...(why ? { why } : {}),
    ...(score != null ? { relevanceScore: score } : {}),
    ...(topicFit ? { topicFit } : {}),
    ...(o.abstractExcerpt === true ? { abstractExcerpt: true } : {}),
  };
}

/**
 * 把确认卡 params.importItems 收成可展示的文献。
 * 优先走正式 schema；缺 id/source 的历史快照也能展开标题和摘要。
 * why / topicFit 不进文献 schema，这里单独保留给确认卡。
 */
export function parseImportConfirmItems(raw: unknown): ImportConfirmItem[] {
  if (!Array.isArray(raw)) return [];
  const out: ImportConfirmItem[] = [];
  for (const item of raw) {
    const display = readDisplayFields(item);
    const parsed = externalLiteratureHitSchema.safeParse(item);
    if (parsed.success) {
      out.push({ ...parsed.data, ...display });
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
      ...display,
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
