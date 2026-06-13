/** 书目导入用 DOI 规范化 */
export function normalizeBibliographyDoi(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "").toLowerCase();
}
