/**
 * RAG chunk 质量：参考文献/致谢页在检索时降权（与 index-pdfs 过滤对齐）。
 */

import { EXTERNAL_ABSTRACT_CATEGORY } from "@/lib/knowledge-category-hints";

/** 全库 RRF 中「外部摘要」整表权重（避免 Top1 摘要与实验室 PDF Top1 同分） */
export const EXTERNAL_ABSTRACT_RRF_WEIGHT = 0.38;

const REF_HEADING =
  /^(?:\s*)(references|bibliography|参考文献|引用文献|文献著录|works cited)\b/im;
const ACK_HEADING = /^(?:\s*)(acknowledgements?|致谢|鸣谢)\b/im;

export function isLikelyReferencesText(
  text: string,
  opts?: { page?: number; minPage?: number },
): boolean {
  const raw = String(text || "").trim();
  if (raw.length < 40) return false;
  const minPage = opts?.minPage ?? 0;
  const page = opts?.page ?? 99;
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

/** 参考文献块在融合分上的乘数（不直接丢弃，避免误杀方法章引用句） */
export function referencesScoreMultiplier(content: string, pageStart?: number): number {
  if (!isLikelyReferencesText(content, { page: pageStart, minPage: 3 })) return 1;
  return 0.18;
}

/**
 * 无 PDF 摘要块降权。query 已指向实验室分类时压得更狠，减少泛英文抢榜。
 */
export function externalAbstractScoreMultiplier(
  category: string | undefined,
  queryHints: string[],
): number {
  if (category !== EXTERNAL_ABSTRACT_CATEGORY) return 1;
  const labHints = queryHints.filter((h) => h && h !== EXTERNAL_ABSTRACT_CATEGORY);
  return labHints.length > 0 ? 0.32 : 0.55;
}

export function ragCategoryRrfWeight(category: string | undefined): number {
  if (category === EXTERNAL_ABSTRACT_CATEGORY) return EXTERNAL_ABSTRACT_RRF_WEIGHT;
  return 1;
}

/** 该列表是否全是外部摘要（全库逐分类 RRF 用） */
export function ragListRrfWeight(chunks: Array<{ metadata: { category?: string } }>): number {
  if (chunks.length === 0) return 1;
  if (chunks.every((c) => c.metadata.category === EXTERNAL_ABSTRACT_CATEGORY)) {
    return EXTERNAL_ABSTRACT_RRF_WEIGHT;
  }
  return 1;
}
