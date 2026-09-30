/**
 * 外部检索命中质量：拦 RSC/Crossref 审稿记录，DOI 去版本后缀后再去重。
 * 例：10.1039/d5gc02932e/v2/review1 与 /v2/review2 不是独立论文。
 */

export function canonicalizeLiteratureDoi(raw: string | undefined | null): string {
  let d = (raw ?? "").trim().toLowerCase();
  if (!d) return "";
  d = d.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "");
  d = d.replace(/[.,;]+$/, "");
  d = d.replace(/\/v\d+\/review\d+$/i, "");
  d = d.replace(/\/review\d+$/i, "");
  return d;
}

export function stripReviewForTitlePrefix(title: string): string {
  return title
    .trim()
    .replace(/^review for\s*["“«]?/i, "")
    .replace(/["”»]\s*$/g, "")
    .trim();
}

export function literatureTitleKey(title: string): string {
  return stripReviewForTitlePrefix(title)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** 审稿意见、同 DOI 的 referee report，不可作参考文献 */
export function isNonCitableLiteratureHit(hit: {
  title?: string;
  doi?: string;
  workType?: string;
}): boolean {
  const title = (hit.title ?? "").trim();
  if (/^review for\b/i.test(title)) return true;
  const doi = (hit.doi ?? "").toLowerCase();
  if (/\/v\d+\/review\d+/i.test(doi) || /\/review\d+(\.|$)/i.test(doi)) return true;
  const t = (hit.workType ?? "").toLowerCase().replace(/^https?:\/\/openalex\.org\/types\//, "");
  if (t.includes("peer-review") || t.includes("peer_review") || t === "peer-review") {
    return true;
  }
  return false;
}

export function literatureMergeKey(hit: { doi?: string; title: string }): string {
  const doi = canonicalizeLiteratureDoi(hit.doi);
  if (doi) return `doi:${doi}`;
  return `title:${literatureTitleKey(hit.title)}`;
}
