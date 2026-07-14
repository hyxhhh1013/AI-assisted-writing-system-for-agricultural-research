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

/** 将正文按匹配段拆分为可高亮片段（按相似度降序处理，避免短串干扰） */
export function splitContentByMatches(
  content: string,
  matches: PlagiarismMatchResult[],
): ContentHighlightPart[] {
  const sorted = [...matches]
    .filter((m) => m.sourceText.trim().length >= 4)
    .sort((a, b) => b.similarity - a.similarity || b.sourceText.length - a.sourceText.length);

  let parts: ContentHighlightPart[] = [{ text: content }];

  for (const m of sorted) {
    const next: ContentHighlightPart[] = [];
    for (const part of parts) {
      if (part.match) {
        next.push(part);
        continue;
      }
      const idx = part.text.indexOf(m.sourceText);
      if (idx === -1) {
        next.push(part);
        continue;
      }
      if (idx > 0) next.push({ text: part.text.slice(0, idx) });
      next.push({ text: m.sourceText, match: m });
      const rest = part.text.slice(idx + m.sourceText.length);
      if (rest) next.push({ text: rest });
    }
    parts = next;
  }

  return parts.filter((p) => p.text.length > 0);
}
