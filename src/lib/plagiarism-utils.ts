import type { PlagiarismMatchResult, RewriteSuggestion } from "@/contracts/plagiarism";

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
    const picked = suggestions[m.id]?.find((s) => accepted[`${m.id}-${s.strategy}`] === true);
    if (!picked?.suggestedText || picked.suggestedText === m.sourceText) continue;

    if (result.includes(m.sourceText)) {
      result = result.replace(m.sourceText, picked.suggestedText);
    }
  }

  return result;
}
