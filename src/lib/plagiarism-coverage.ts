export const OVERLAP_HIGH = 0.25;
export const OVERLAP_MEDIUM = 0.08;
export const MATCH_CONTAINMENT_HIGH = 0.55;
export const MATCH_CONTAINMENT_MEDIUM = 0.3;

export type OverlapRisk = "high" | "medium" | "low";

export function riskFromOverlap(coverage: number): OverlapRisk {
  if (coverage >= OVERLAP_HIGH) return "high";
  if (coverage >= OVERLAP_MEDIUM) return "medium";
  return "low";
}

export function riskFromContainment(similarity: number): OverlapRisk {
  if (similarity >= MATCH_CONTAINMENT_HIGH) return "high";
  if (similarity >= MATCH_CONTAINMENT_MEDIUM) return "medium";
  return "low";
}

export function isSkippedSectionTitle(title: string): boolean {
  return /参考文献|references|bibliography/i.test(title.trim());
}

export function isSkippedParagraph(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 20) return true;
  if (/^(图|表)\s*[\d一二三四五六七八九十]/.test(trimmed)) return true;
  if (/^(fig\.?|figure|table)\s*\d/i.test(trimmed)) return true;
  return false;
}

export interface CoverageSpan {
  offset: number;
  length: number;
  matchType: string;
}

/** 非 ai 命中区间的并集长度。同一段多种命中只算一次。 */
export function unionCoveredLength(spans: CoverageSpan[]): number {
  const intervals = spans
    .filter((span) => span.matchType !== "ai" && span.length > 0)
    .map((span) => ({ start: span.offset, end: span.offset + span.length }))
    .sort((a, b) => a.start - b.start || a.end - b.end);

  let total = 0;
  let start = 0;
  let end = 0;
  let open = false;
  for (const interval of intervals) {
    if (!open) {
      start = interval.start;
      end = interval.end;
      open = true;
      continue;
    }
    if (interval.start <= end) {
      end = Math.max(end, interval.end);
    } else {
      total += end - start;
      start = interval.start;
      end = interval.end;
    }
  }
  if (open) total += end - start;
  return total;
}

export function overlapCoverage(spans: CoverageSpan[], eligibleChars: number): number {
  if (eligibleChars <= 0) return 0;
  const covered = Math.min(eligibleChars, unionCoveredLength(spans));
  return covered / eligibleChars;
}

export function displayedOverlap(result: {
  overlapCoverage?: number | null;
  maxSimilarity: number;
}): { value: number; legacy: boolean } {
  if (typeof result.overlapCoverage === "number" && Number.isFinite(result.overlapCoverage)) {
    return { value: result.overlapCoverage, legacy: false };
  }
  return { value: result.maxSimilarity, legacy: true };
}

export function labelCorpusSource(source: string, referenceTitles: string[]): string {
  const trimmed = source.trim();
  if (!trimmed || trimmed.startsWith("项目文献")) return trimmed;
  const base = trimmed.replace(/\.[a-z0-9]{1,5}$/i, "");
  const hit = referenceTitles.some((title) => {
    const name = title.trim();
    if (name.length < 4 || base.length < 4) return false;
    return name.includes(base) || base.includes(name) || name.includes(trimmed);
  });
  return hit ? `项目文献·${trimmed}` : trimmed;
}

export function dedupeByOffsetAndType<T extends {
  sourceOffset: number;
  matchType: string;
  similarity: number;
}>(matches: T[]): T[] {
  const best = new Map<string, T>();
  for (const match of matches) {
    const key = `${match.sourceOffset}:${match.matchType}`;
    const prev = best.get(key);
    if (!prev || match.similarity > prev.similarity) best.set(key, match);
  }
  return [...best.values()];
}

export interface CoverageSection {
  key: string;
  title: string;
  content: string;
}

export interface CheckedParagraph {
  text: string;
  offset: number;
  sectionKey: string;
  sectionTitle: string;
}

/** 与质量中心拼接正文的格式一致：`标题：\\n正文`，章与章之间空行。 */
export function joinSectionBlocks(sections: Array<{ title: string; content: string }>): string {
  return sections.map((section) => `${section.title}：\n${section.content}`).join("\n\n");
}

export function splitParagraphs(text: string): { text: string; offset: number }[] {
  const cleaned = text.replace(/<[^>]+>/g, "").replace(/\r\n/g, "\n").trim();
  const rawParts = cleaned.split(/\n\s*\n|(?<=[。！？；])\s*/);
  const result: { text: string; offset: number }[] = [];
  let searchFrom = 0;
  for (const part of rawParts) {
    const paragraph = part.trim();
    if (paragraph.length >= 8) {
      const at = cleaned.indexOf(paragraph, searchFrom);
      const offset = at >= 0 ? at : searchFrom;
      result.push({ text: paragraph, offset });
      searchFrom = offset + paragraph.length;
    }
  }
  return result;
}

export function locateParagraphs(sections: CoverageSection[]): {
  canonical: string;
  paragraphs: CheckedParagraph[];
  eligibleChars: number;
} {
  const canonical = joinSectionBlocks(sections);
  const paragraphs: CheckedParagraph[] = [];
  let eligibleChars = 0;
  let cursor = 0;

  sections.forEach((section, index) => {
    if (index > 0) cursor += 2;
    const prefix = `${section.title}：\n`;
    const contentStart = cursor + prefix.length;
    if (!isSkippedSectionTitle(section.title)) {
      let searchFrom = 0;
      for (const paragraph of splitParagraphs(section.content)) {
        const local = section.content.indexOf(paragraph.text, searchFrom);
        const at = local >= 0 ? local : searchFrom;
        searchFrom = at + paragraph.text.length;
        paragraphs.push({
          text: paragraph.text,
          offset: contentStart + at,
          sectionKey: section.key,
          sectionTitle: section.title,
        });
        if (!isSkippedParagraph(paragraph.text)) eligibleChars += paragraph.text.length;
      }
    }
    cursor += prefix.length + section.content.length;
  });

  return { canonical, paragraphs, eligibleChars };
}
