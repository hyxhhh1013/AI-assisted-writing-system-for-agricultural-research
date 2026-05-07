/**
 * 引用真实性校验：检查 draft 中的 [n] 引用是否在对应的 source 中有文本依据。
 * 使用关键词重叠作为代理指标（不调用 LLM，零开销）。
 * 搜索全部 contextText 而非依赖编号映射。
 */

interface CitationCheckResult {
  number: number;
  sourceName: string;
  citedSentence: string;
  overlap: number;
  passed: boolean;
}

function extractCitationContext(text: string, position: number, windowSize = 80): string {
  const start = Math.max(0, position - windowSize);
  const end = Math.min(text.length, position + windowSize);
  return text.slice(start, end);
}

function extractKeyTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const englishWords = text.toLowerCase().match(/[a-z]{3,}/g);
  if (englishWords) englishWords.forEach((w) => terms.add(w));
  const chineseChars = text.replace(/[^一-龥]/g, "");
  for (let i = 0; i < chineseChars.length - 1; i++) {
    terms.add(chineseChars.substring(i, i + 2));
  }
  const contentChars = chineseChars.replace(/[的得地了着过在于是在与和或及而是被把对以从到向由按通过]/g, "");
  for (const ch of contentChars) terms.add(ch);
  return terms;
}

const OVERLAP_THRESHOLD = 0.08;

export function validateCitations(draftText: string, contextText: string): CitationCheckResult[] {
  if (!draftText || !contextText) return [];

  const results: CitationCheckResult[] = [];
  const seen = new Set<number>();
  const citationRegex = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = citationRegex.exec(draftText)) !== null) {
    const num = parseInt(match[1], 10);
    if (seen.has(num)) continue;
    seen.add(num);

    const citedSentence = extractCitationContext(draftText, match.index);
    const draftTerms = extractKeyTerms(citedSentence);

    if (draftTerms.size === 0) {
      results.push({ number: num, sourceName: `[${num}]`, citedSentence, overlap: 1, passed: true });
      continue;
    }

    // 在全部 contextText 中搜索关键词重叠率最高的段落
    const paragraphs = contextText.split(/\n\n+/);
    let bestOverlap = 0;
    let bestSource = `[${num}]`;

    for (const para of paragraphs) {
      if (para.length < 20) continue;
      const sourceTerms = extractKeyTerms(para);
      let overlapCount = 0;
      for (const term of draftTerms) {
        if (sourceTerms.has(term)) overlapCount++;
      }
      const overlap = overlapCount / draftTerms.size;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        // 提取来源名（中括号前的文字）
        const nameMatch = para.match(/^(.+?)(?:\n|$)/);
        if (nameMatch) bestSource = nameMatch[1].trim();
      }
    }

    results.push({
      number: num,
      sourceName: bestSource,
      citedSentence,
      overlap: bestOverlap,
      passed: bestOverlap >= OVERLAP_THRESHOLD,
    });
  }

  return results;
}
