/**
 * 引用真实性校验：检查 draft 中的 [n] 引用是否在对应的 source 中有文本依据。
 * 使用关键词重叠作为代理指标（不调用 LLM，零开销）。
 */

interface CitationCheckResult {
  number: number;
  sourceName: string;
  /** 引用所在的上下文句段 */
  citedSentence: string;
  /** 重叠率 (0-1)，越低越可疑 */
  overlap: number;
  /** 是否通过校验 */
  passed: boolean;
}

/** 从正文中提取含 [n] 的句段（取引用前后各 80 个字符） */
function extractCitationContext(text: string, position: number, windowSize = 80): string {
  const start = Math.max(0, position - windowSize);
  const end = Math.min(text.length, position + windowSize);
  return text.slice(start, end);
}

/** 提取文本的关键词（中文 bigram + 英文词，去停用词） */
function extractKeyTerms(text: string): Set<string> {
  const terms = new Set<string>();
  // 英文单词
  const englishWords = text.toLowerCase().match(/[a-z]{3,}/g);
  if (englishWords) englishWords.forEach((w) => terms.add(w));
  // 中文 bigram
  const chineseChars = text.replace(/[^一-龥]/g, "");
  for (let i = 0; i < chineseChars.length - 1; i++) {
    const bigram = chineseChars.substring(i, i + 2);
    terms.add(bigram);
  }
  // 中文单字（跳过虚词）
  const contentChars = chineseChars.replace(/[的得地了着过在于是在与和或及而是被把对以从到向由按通过]/g, "");
  for (const ch of contentChars) {
    terms.add(ch);
  }
  return terms;
}

/** 从 contextText 中提取 [参考来源 [n]] ... 对应的 source 文本 */
function findSourceForCitation(contextText: string, citationNum: number): string {
  const marker = `[参考来源 [${citationNum}]:`;
  const idx = contextText.indexOf(marker);
  if (idx === -1) return "";

  // 找下一个 [参考来源 或结尾
  const remaining = contextText.slice(idx + marker.length);
  const nextMarker = remaining.search(/\[参考来源 \[\d+\]:/);
  const end = nextMarker !== -1 ? nextMarker : remaining.length;
  return remaining.slice(0, end).trim();
}

const OVERLAP_THRESHOLD = 0.05;

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
    const sourceText = findSourceForCitation(contextText, num);

    if (!sourceText) {
      results.push({
        number: num,
        sourceName: `[${num}]`,
        citedSentence,
        overlap: 0,
        passed: false,
      });
      continue;
    }

    // 提取关键词并计算重叠
    const draftTerms = extractKeyTerms(citedSentence);
    const sourceTerms = extractKeyTerms(sourceText);

    if (draftTerms.size === 0) {
      results.push({ number: num, sourceName: `[${num}]`, citedSentence, overlap: 1, passed: true });
      continue;
    }

    let overlapCount = 0;
    for (const term of draftTerms) {
      if (sourceTerms.has(term)) overlapCount++;
    }
    const overlap = overlapCount / draftTerms.size;

    results.push({
      number: num,
      sourceName: `[${num}]`,
      citedSentence,
      overlap,
      passed: overlap >= OVERLAP_THRESHOLD,
    });
  }

  return results;
}
