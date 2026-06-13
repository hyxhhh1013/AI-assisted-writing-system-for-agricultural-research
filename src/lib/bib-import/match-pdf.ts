import type { KnowledgeBib } from "@/contracts/knowledge";

export interface PdfMatchCandidate {
  name: string;
  size: number;
  bib?: KnowledgeBib | null;
}

/** 标题规范化：小写、去标点、合并空白 */
export function normalizeTitleKey(title: string): string {
  return title
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\.pdf$/i, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function titleSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  if (short.length >= 8 && long.includes(short)) return 0.85;
  const prefix = short.slice(0, Math.min(16, short.length));
  if (prefix.length >= 8 && long.includes(prefix)) return 0.7;
  return 0;
}

/** 按标题模糊匹配已有 PDF（size>0）；不做 AI 匹配 */
export function findPdfMatchForTitle(title: string, candidates: PdfMatchCandidate[]): string | null {
  const key = normalizeTitleKey(title);
  if (!key) return null;

  let bestName: string | null = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    if (candidate.size <= 0) continue;
    const fromBib = candidate.bib?.title ? normalizeTitleKey(candidate.bib.title) : "";
    const fromName = normalizeTitleKey(candidate.name);
    const score = Math.max(
      titleSimilarity(key, fromBib),
      titleSimilarity(key, fromName),
    );
    if (score > bestScore && score >= 0.7) {
      bestScore = score;
      bestName = candidate.name;
    }
  }

  return bestName;
}
