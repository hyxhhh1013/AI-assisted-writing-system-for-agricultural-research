export function extractDoiFromText(text) {
  const trimmed = String(text).trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/doi\.org\/(10\.\S+)/i);
  if (urlMatch) return urlMatch[1].replace(/[.,;]+$/, "");
  const bare = trimmed.match(/(?:doi[:\s]*)?(10\.\d{4,}\/[^\s"<>，。、；]+)/i);
  return bare ? bare[1].replace(/[.,;]+$/, "") : null;
}

export function patchBibWithExtractedDoi(bib) {
  if (!bib) return null;
  if (bib.doi?.trim()) {
    const normalized = extractDoiFromText(bib.doi);
    return normalized && normalized !== bib.doi ? { ...bib, doi: normalized } : bib;
  }
  for (const field of [bib.journal, bib.title]) {
    const doi = field ? extractDoiFromText(field) : null;
    if (doi) return { ...bib, doi };
  }
  return bib;
}

export function extractDoiFromBib(bib) {
  if (!bib) return null;
  if (bib.doi?.trim()) return extractDoiFromText(bib.doi);
  for (const field of [bib.journal, bib.title]) {
    const doi = field ? extractDoiFromText(field) : null;
    if (doi) return doi;
  }
  return null;
}
