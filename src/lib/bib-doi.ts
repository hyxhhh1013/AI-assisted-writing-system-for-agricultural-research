import type { KnowledgeBib } from "@/contracts/knowledge";

/** 从任意文本提取 DOI */
export function extractDoiFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/doi\.org\/(10\.\S+)/i);
  if (urlMatch) return urlMatch[1].replace(/[.,;]+$/, "");
  const bare = trimmed.match(/(?:doi[:\s]*)?(10\.\d{4,}\/[^\s"<>，。、；]+)/i);
  return bare ? bare[1].replace(/[.,;]+$/, "") : null;
}

/** 从书目各字段补全 bib.doi */
export function patchBibWithExtractedDoi(bib: KnowledgeBib | null | undefined): KnowledgeBib | null {
  if (!bib) return null;
  if (bib.doi?.trim()) {
    const normalized = extractDoiFromText(bib.doi);
    if (normalized && normalized !== bib.doi) {
      return { ...bib, doi: normalized };
    }
    return bib;
  }
  for (const field of [bib.journal, bib.title]) {
    const doi = field ? extractDoiFromText(field) : null;
    if (doi) return { ...bib, doi };
  }
  return bib;
}
