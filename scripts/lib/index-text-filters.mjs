/**
 * 索引/检索共用的文本质量判断：参考文献页、致谢页会污染 BM25 与向量召回。
 */

const REF_HEADING =
  /^(?:\s*)(references|bibliography|参考文献|引用文献|文献著录|works cited)\b/im;
const ACK_HEADING = /^(?:\s*)(acknowledgements?|致谢|鸣谢)\b/im;

export function isLikelyReferencesText(text, opts = {}) {
  const raw = String(text || "").trim();
  if (raw.length < 40) return false;
  const minPage = opts.minPage ?? 0;
  const page = opts.page ?? 99;
  if (page > 0 && page < minPage) return false;

  const head = raw.slice(0, 400);
  const citeBrackets = (raw.match(/\[\d{1,3}\]/g) || []).length;
  const numbered = (raw.match(/^\s*\d{1,3}\.\s+\S/gm) || []).length;
  const doiHits = (raw.match(/10\.\d{4,}\//g) || []).length;
  const yearHits = (raw.match(/\b(?:19|20)\d{2}\b/g) || []).length;

  if (ACK_HEADING.test(head) && raw.length < 2500) return true;
  if (REF_HEADING.test(head) && citeBrackets + numbered >= 4) return true;
  if (citeBrackets >= 10 && yearHits >= 6) return true;
  if (numbered >= 8 && doiHits >= 2) return true;
  if (citeBrackets >= 6 && doiHits >= 3 && raw.length < 6000) return true;
  return false;
}
