import type { PlagiarismMatchResult, RewriteSuggestion } from "@/contracts/plagiarism";
import type { QualitySection } from "@/lib/quality-sections";

function pickAcceptedSuggestion(
  matchId: string,
  suggestions: Record<string, RewriteSuggestion[]>,
  accepted: Record<string, boolean | undefined>,
): RewriteSuggestion | undefined {
  return suggestions[matchId]?.find((s) => accepted[`${matchId}-${s.strategy}`] === true);
}

/** 将已采纳的改写建议应用到全文（按 sourceText 替换，保留未匹配段落） */
export function applyAcceptedRewritesToContent(
  content: string,
  matches: PlagiarismMatchResult[],
  suggestions: Record<string, RewriteSuggestion[]>,
  accepted: Record<string, boolean | undefined>,
): string {
  let result = content;
  const highRisk = matches.filter((m) => m.riskLevel !== "low");

  for (const m of highRisk) {
    const picked = pickAcceptedSuggestion(m.id, suggestions, accepted);
    if (!picked?.suggestedText || picked.suggestedText === m.sourceText) continue;
    if (result.includes(m.sourceText)) {
      result = result.replace(m.sourceText, picked.suggestedText);
    }
  }

  return result;
}

/** 按章节应用改写，返回更新后的章节与变更 key 列表 */
export function applyAcceptedRewritesToSections(
  sections: QualitySection[],
  matches: PlagiarismMatchResult[],
  suggestions: Record<string, RewriteSuggestion[]>,
  accepted: Record<string, boolean | undefined>,
): { sections: QualitySection[]; changedKeys: string[] } {
  const highRisk = matches.filter((m) => m.riskLevel !== "low");
  const changedKeys: string[] = [];

  const updated = sections.map((section) => {
    let content = section.content;
    let changed = false;

    for (const m of highRisk) {
      const picked = pickAcceptedSuggestion(m.id, suggestions, accepted);
      if (!picked?.suggestedText || picked.suggestedText === m.sourceText) continue;
      if (content.includes(m.sourceText)) {
        content = content.replace(m.sourceText, picked.suggestedText);
        changed = true;
      }
    }

    if (changed) {
      changedKeys.push(section.key);
      return { ...section, content, wordCount: content.length };
    }
    return section;
  });

  return { sections: updated, changedKeys };
}

export interface ContentHighlightPart {
  text: string;
  match?: PlagiarismMatchResult;
}

export interface PlaceMatchesResult {
  parts: ContentHighlightPart[];
  /** 正文里找不到区间。不要当成偏移 0 涂在文首。 */
  unplaced: PlagiarismMatchResult[];
}

const RISK_RANK: Record<PlagiarismMatchResult["riskLevel"], number> = {
  high: 3,
  medium: 2,
  low: 1,
};

function sliceAgrees(slice: string, sourceText: string): boolean {
  const left = slice.trim();
  const right = sourceText.trim();
  if (!left || !right) return false;
  if (left === right || left.startsWith(right) || right.startsWith(left)) return true;
  const n = Math.min(12, left.length, right.length);
  return left.slice(0, n) === right.slice(0, n);
}

function locateSpan(
  content: string,
  match: PlagiarismMatchResult,
): { start: number; end: number } | null {
  const source = match.sourceText;
  const length = match.sourceLength ?? 0;
  const offset = match.sourceOffset ?? 0;

  if (length > 0 && offset >= 0 && offset + length <= content.length) {
    const slice = content.slice(offset, offset + length);
    if (sliceAgrees(slice, source)) {
      return { start: offset, end: offset + length };
    }
  }

  const idx = content.indexOf(source);
  if (idx === -1) return null;
  return { start: idx, end: idx + source.length };
}

/**
 * 按 sourceOffset/sourceLength 把命中涂进正文。
 * 偏移越界或切片对不上原文时改全文搜索；仍找不到则进入 unplaced。
 * 重叠区间留给风险更高的一条占底色，另一条仍留在调用方的命中列表里。
 */
export function placeMatchesInContent(
  content: string,
  matches: PlagiarismMatchResult[],
): PlaceMatchesResult {
  const unplaced: PlagiarismMatchResult[] = [];
  const located: Array<{ start: number; end: number; match: PlagiarismMatchResult }> = [];

  for (const match of matches) {
    if (match.sourceText.trim().length < 4) {
      unplaced.push(match);
      continue;
    }
    const span = locateSpan(content, match);
    if (!span || span.start < 0 || span.end > content.length || span.end <= span.start) {
      unplaced.push(match);
      continue;
    }
    located.push({ ...span, match });
  }

  located.sort((a, b) => {
    const byRisk = (RISK_RANK[b.match.riskLevel] ?? 0) - (RISK_RANK[a.match.riskLevel] ?? 0);
    if (byRisk !== 0) return byRisk;
    if (b.match.similarity !== a.match.similarity) return b.match.similarity - a.match.similarity;
    return (b.end - b.start) - (a.end - a.start);
  });

  const painted: Array<{ start: number; end: number; match: PlagiarismMatchResult }> = [];
  for (const span of located) {
    const overlaps = painted.some((kept) => span.start < kept.end && kept.start < span.end);
    if (overlaps) continue;
    painted.push(span);
  }
  painted.sort((a, b) => a.start - b.start);

  const parts: ContentHighlightPart[] = [];
  let cursor = 0;
  for (const span of painted) {
    if (span.start > cursor) parts.push({ text: content.slice(cursor, span.start) });
    parts.push({ text: content.slice(span.start, span.end), match: span.match });
    cursor = span.end;
  }
  if (cursor < content.length) parts.push({ text: content.slice(cursor) });
  if (parts.length === 0) parts.push({ text: content });

  return {
    parts: parts.filter((part) => part.text.length > 0),
    unplaced,
  };
}

/** 将正文按匹配段拆分为可高亮片段。涂不上的命中不占文首。 */
export function splitContentByMatches(
  content: string,
  matches: PlagiarismMatchResult[],
): ContentHighlightPart[] {
  return placeMatchesInContent(content, matches).parts;
}

/** 把套话正则收成可读短语，兼容已经落库的 `re.source` 片段。 */
export function humanizeClichePattern(raw: string): string {
  const cleaned = raw
    .replace(/\(\?:/g, "(")
    .replace(/\(([^()]*)\)/g, (_, inner: string) => inner.split("|").join("/"))
    .replace(/\[[^\]]*\](?:\{[0-9,]+\})?/g, "…")
    .replace(/\\./g, "")
    .replace(/[+*?]/g, "")
    .replace(/[{}]/g, "")
    .replace(/…{2,}/g, "…")
    .replace(/\s+/g, "")
    .trim();
  return cleaned || raw;
}

/** 展示用：去掉引号里的正则，保留「出现 N 次」和例句。 */
export function presentMatchDetail(text: string): string {
  return text.replace(/"([^"]*)"/g, (_, inner: string) => `「${humanizeClichePattern(inner)}」`);
}
