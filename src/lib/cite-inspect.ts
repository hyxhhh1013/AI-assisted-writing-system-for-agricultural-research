/**
 * 预览里点 [n] 弹出的引用核查：标题摘要、出处三态、文中位置。
 */

export function shortCiteTitle(citation: string, apiTitle?: string | null): string {
  const fromApi = apiTitle?.trim();
  if (fromApi) return fromApi;
  const journalTitle = citation.match(/\.\s+(.+?)(?:\[J\]|\[C\]|\[D\]|\[M\]|\[P\])/);
  if (journalTitle?.[1]?.trim()) return journalTitle[1].trim();
  const clipped = citation.replace(/^\[[\d]+\]\s*/, "").trim();
  return clipped.length > 110 ? `${clipped.slice(0, 109)}…` : clipped;
}

export function citeYear(citation: string): string | null {
  const m = citation.match(/\b((?:19|20)\d{2})\b/);
  return m?.[1] ?? null;
}

export function groupCiteContextsBySection(
  contexts: readonly { sectionLabel: string; snippet: string }[],
): { sectionLabel: string; snippets: string[] }[] {
  const order: string[] = [];
  const map = new Map<string, string[]>();
  for (const c of contexts) {
    const label = c.sectionLabel.trim() || "正文";
    if (!map.has(label)) {
      order.push(label);
      map.set(label, []);
    }
    map.get(label)?.push(c.snippet);
  }
  return order.map((sectionLabel) => ({
    sectionLabel,
    snippets: map.get(sectionLabel) ?? [],
  }));
}
