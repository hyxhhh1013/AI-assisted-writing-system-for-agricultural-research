import type { ExternalLiteratureHit } from "@/contracts/literature";
import type {
  ReferenceEvidenceMeta,
  SoftReferenceEvidence,
} from "@/contracts/project";

/** 入库摘要上限（避免单行过大） */
export const MAX_STORED_ABSTRACT_CHARS = 8000;

/** soft-grounded 最短摘要长度 */
export const MIN_ABSTRACT_CHARS_FOR_GROUNDING = 80;

/** 写入上下文时的摘要截断 */
export const MAX_CONTEXT_ABSTRACT_CHARS = 1500;

export function hitToReferenceMeta(hit: ExternalLiteratureHit): ReferenceEvidenceMeta {
  const abstract = hit.abstract?.replace(/\s+/g, " ").trim();
  return {
    doi: hit.doi?.trim() || undefined,
    title: hit.title?.trim().slice(0, 500) || undefined,
    abstract: abstract
      ? abstract.slice(0, MAX_STORED_ABSTRACT_CHARS)
      : undefined,
    openAccessUrl: hit.openAccessUrl?.trim() || undefined,
    externalId: hit.id?.trim() || undefined,
    externalSource: hit.source,
  };
}

export function isSoftGroundable(abstract?: string | null): boolean {
  return Boolean(abstract && abstract.trim().length >= MIN_ABSTRACT_CHARS_FOR_GROUNDING);
}

export function rowsToSoftReferenceEvidence(
  rows: Array<{
    order: number;
    title?: string | null;
    abstract?: string | null;
    doi?: string | null;
  }>,
): SoftReferenceEvidence[] {
  const out: SoftReferenceEvidence[] = [];
  for (const r of rows) {
    if (!isSoftGroundable(r.abstract)) continue;
    out.push({
      index: r.order + 1,
      title: r.title?.trim() || undefined,
      abstract: r.abstract!.trim(),
      doi: r.doi?.trim() || undefined,
    });
  }
  return out;
}

export function formatSoftEvidenceBlock(ev: SoftReferenceEvidence): string {
  const title = ev.title?.slice(0, 120) || "外部导入文献";
  const abs = (ev.abstract ?? "").slice(0, MAX_CONTEXT_ABSTRACT_CHARS);
  const doi = ev.doi ? ` DOI:${ev.doi}` : "";
  return `[参考来源 [${ev.index}]: ${title} · 摘要${doi}]\n${abs}`;
}
