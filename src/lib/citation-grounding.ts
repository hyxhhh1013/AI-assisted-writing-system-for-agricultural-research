/**
 * W3-AP-CITE-GROUND — 编号合法前提下，对照「该条」题录/摘要/段落做语义接地。
 * 集合高频词（热解/biochar）降权；限定词对不上则判错引。
 * 可判定的错引阻断导出（缺摘要仍不挡，只标无法判定）。
 */

import type {
  CitationGroundingHit,
  CitationGroundingInput,
  CitationGroundingRef,
  CitationGroundingReport,
  SoftGroundPoolStats,
} from "@/contracts/citation-grounding";
import {
  CITATION_GROUP_RE,
  expandCitationGroup,
  normalizeAllCitationFormats,
} from "@/lib/citation";
import {
  isSoftGroundable,
  MIN_ABSTRACT_CHARS_FOR_GROUNDING,
} from "@/lib/reference-evidence";
import {
  expandRagQueries,
  groundingSynonymGloss,
  isEnglishStopword,
  isGenericAcademicEnTerm,
} from "@/lib/rag-query-expand";

const DEFAULT_OVERLAP_THRESHOLD = 0.12;
const DEFAULT_MAX_SUSPICIOUS = 12;
/** 题录/摘要合计少于此长度则标 ungroundable（无法判语义） */
const MIN_REF_TEXT_CHARS = 40;
/** 出现在 ≥ 该比例文献中的词视为集合词，几乎不拉开对错 */
const COLLECTION_TERM_DF = 0.5;
const BETTER_MATCH_RATIO = 1.35;
const BETTER_MATCH_MIN = 0.2;

export function extractKeyTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const englishWords = text.toLowerCase().match(/[a-z]{3,}/g);
  if (englishWords) {
    for (const w of englishWords) {
      if (isEnglishStopword(w) || isGenericAcademicEnTerm(w)) continue;
      terms.add(w);
    }
  }
  // 中文只用 bigram，避免单字「度/下/了」造成跨主题假重叠
  const chineseChars = text.replace(/[^一-龥]/g, "");
  for (let i = 0; i < chineseChars.length - 1; i++) {
    terms.add(chineseChars.substring(i, i + 2));
  }
  return terms;
}

/** 中英同义词展开后再抽词，避免中文句对英文摘要被跳过 */
export function expandGroundingText(text: string): string {
  const variants = expandRagQueries(text);
  const gloss = groundingSynonymGloss(text);
  return [text, ...variants, gloss].filter((part) => part.length > 0).join("\n");
}

export function termOverlapRatio(a: string, b: string): number {
  const draftTerms = extractKeyTerms(a);
  if (draftTerms.size === 0) return 1;
  const sourceTerms = extractKeyTerms(b);
  if (sourceTerms.size === 0) return 0;
  let overlapCount = 0;
  for (const term of draftTerms) {
    if (sourceTerms.has(term)) overlapCount++;
  }
  return overlapCount / draftTerms.size;
}

function tokenWeight(df: number, n: number): number {
  if (n <= 0) return 1;
  const frac = df / n;
  if (frac >= COLLECTION_TERM_DF) return 0.08;
  return Math.log((n + 1) / (df + 1));
}

function documentFrequency(termSets: Set<string>[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const terms of termSets) {
    for (const t of terms) {
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }
  return df;
}

function weightedRecall(
  queryTerms: Set<string>,
  paperTerms: Set<string>,
  df: Map<string, number>,
  n: number,
): number {
  let num = 0;
  let den = 0;
  for (const t of queryTerms) {
    const d = df.get(t) ?? 0;
    if (d < 1) continue;
    const w = tokenWeight(d, n);
    den += w;
    if (paperTerms.has(t)) num += w;
  }
  if (den <= 0) return 0;
  return num / den;
}

/**
 * 查询相对一组语料的集合 IDF 加权分（写节绑文献与引用核查共用）。
 */
export function collectionWeightedScores(query: string, corpora: string[]): number[] {
  const queryTerms = extractKeyTerms(expandGroundingText(query));
  const paperSets = corpora.map((c) => extractKeyTerms(expandGroundingText(c)));
  const df = documentFrequency(paperSets);
  const n = Math.max(paperSets.length, 1);
  return paperSets.map((paper) => weightedRecall(queryTerms, paper, df, n));
}

function distinctiveTerms(
  queryTerms: Set<string>,
  df: Map<string, number>,
  n: number,
): string[] {
  const out: string[] = [];
  for (const t of queryTerms) {
    const d = df.get(t) ?? 0;
    if (d < 1) continue;
    if (d / n >= COLLECTION_TERM_DF) continue;
    out.push(t);
  }
  return out;
}

function refCorpus(ref: CitationGroundingRef): string {
  return [ref.title, ref.abstract, ref.content]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .join("\n");
}

/**
 * PDF 首页/参考文献区被截进题录或摘要时，不能当可判定语料。
 * 否则中文句子对不上页眉碎片，错引硬门会把整次 Word/PDF 导出拦住。
 * 已补上的 PDF 段落（content）仍可判定。
 */
export function isPdfPageScrapeRef(ref: CitationGroundingRef): boolean {
  const passage = (ref.content ?? "").replace(/\s+/g, "");
  if (passage.length >= 240) return false;
  const title = ref.title ?? "";
  const abs = (ref.abstract ?? "").replace(/\s+/g, " ").trim();
  const blob = `${title}\n${abs}`;
  const header = /contents lists available|available online at|journal homepage/i.test(blob);
  const absCompact = abs.replace(/\s+/g, "");
  if (header && absCompact.length < 800) return true;
  if (absCompact.length < 80 || absCompact.length > 1200) return false;
  if (/[一-龥]{12,}/.test(abs)) return false;
  const years = abs.match(/\b(?:19|20)\d{2}\b/g)?.length ?? 0;
  const etal = (abs.match(/et al\.?/gi) ?? []).length;
  const fig = /\bFig\.\s*\d/i.test(abs);
  const doi = /doi\.org/i.test(abs);
  const splits = (abs.match(/[,;]/g) ?? []).length;
  const startsMidSentence = /^[^A-Z一-龥「」]/.test(abs);
  return years >= 2
    || etal >= 2
    || fig
    || doi
    || (startsMidSentence && years >= 1)
    || (splits >= 4 && years >= 1 && absCompact.length < 600);
}

/**
 * 库里只剩 PDF 文件名（无题录、无摘要）时，中文文件名里的「生物炭/热解」
 * 会比页眉碎片得分更高，改号清单就会把句子挂到文件名上，并在两个文件名之间对翻。
 * 这种条目不能当可判定语料，也不能当 betterNumber。
 */
export function isFilenameOnlyRef(ref: CitationGroundingRef): boolean {
  const abs = (ref.abstract ?? "").replace(/\s+/g, "");
  if (abs.length >= MIN_REF_TEXT_CHARS) return false;
  const content = (ref.content ?? "").trim();
  if (content.replace(/\s+/g, "").length >= 240) return false;
  const title = (ref.title ?? "").trim();
  if (title && !/\.pdf$/i.test(title)) return false;
  return /\.pdf$/i.test(title) || /\.pdf$/i.test(content);
}

function isRefGroundable(ref: CitationGroundingRef | undefined): boolean {
  if (!ref) return false;
  if (isPdfPageScrapeRef(ref)) return false;
  if (isFilenameOnlyRef(ref)) return false;
  const corpus = refCorpus(ref).replace(/\s+/g, " ").trim();
  if (corpus.length < MIN_REF_TEXT_CHARS) return false;
  return true;
}

/** 每个 [n] 出现一次记一条（同号多次只保留最低 overlap） */
function collectPerNumberHits(
  draftText: string,
  refMap: Map<number, CitationGroundingRef>,
  threshold: number,
): CitationGroundingHit[] {
  // 改号候选只在可判定文献里挑。文件名、页眉碎片不进分数池，避免 [25]↔[27] 对翻。
  const refs = [...refMap.entries()]
    .filter(([idx, ref]) => idx >= 1 && isRefGroundable(ref))
    .sort((a, b) => a[0] - b[0]);
  const paperSets = refs.map(([, ref]) =>
    extractKeyTerms(expandGroundingText(refCorpus(ref))),
  );
  const df = documentFrequency(paperSets);
  const nPapers = Math.max(paperSets.length, 1);
  const indexByPos = refs.map(([idx]) => idx);

  const normalized = normalizeAllCitationFormats(draftText);
  const bestByNumber = new Map<number, CitationGroundingHit>();
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;

  while ((m = re.exec(normalized)) !== null) {
    const nums = expandCitationGroup(m[1]);
    const sentence = extractCitationContext(normalized, m.index);
    const queryTerms = extractKeyTerms(expandGroundingText(sentence));
    const scores = paperSets.map((paper) =>
      weightedRecall(queryTerms, paper, df, nPapers),
    );
    const distinctive = distinctiveTerms(queryTerms, df, nPapers);
    let bestOtherIdx = -1;
    let bestOtherScore = 0;
    for (let i = 0; i < scores.length; i++) {
      if (scores[i] > bestOtherScore) {
        bestOtherScore = scores[i];
        bestOtherIdx = i;
      }
    }

    for (const num of nums) {
      if (num < 1) continue;
      const ref = refMap.get(num);
      const hasText = isRefGroundable(ref);
      const pos = indexByPos.indexOf(num);
      const overlap = pos >= 0 ? scores[pos] ?? 0 : 0;
      let reason = "无可用题录/摘要，跳过语义判定";
      let refTitle: string | undefined;
      let groundable = false;
      let suspicious = false;
      let betterNumber: number | undefined;

      if (ref && hasText) {
        refTitle = ref.title?.trim() || undefined;
        groundable = true;
        const paperTerms = pos >= 0 ? paperSets[pos] : new Set<string>();
        const distinctiveHits = distinctive.filter((t) => paperTerms.has(t)).length;
        const distinctiveMiss =
          distinctive.length >= 2 && distinctiveHits === 0;
        const betterPos =
          bestOtherIdx >= 0 && indexByPos[bestOtherIdx] !== num
            ? bestOtherIdx
            : -1;
        const betterIsStrong =
          betterPos >= 0
          && bestOtherScore >= BETTER_MATCH_MIN
          && bestOtherScore >= overlap * BETTER_MATCH_RATIO;
        if (betterIsStrong && (distinctiveHits === 0 || distinctiveMiss || overlap < threshold)) {
          suspicious = true;
          betterNumber = indexByPos[betterPos];
          reason = `句意更接近 [${betterNumber}]，当前 [${num}] 不能支撑该主张`;
        } else if (
          distinctiveMiss
          || (overlap < threshold && distinctiveHits === 0)
        ) {
          reason = "这句话和被引文献的用词对不上，判不了，不拦导出";
        } else if (overlap < threshold && distinctive.length === 0) {
          reason = overlap < Math.min(threshold, 0.08)
            ? "句意与该条文献几乎无重叠，判不了，不拦导出"
            : "句意仅为领域套话，集合词可对上该条";
        } else {
          reason = "句意与该条题录/摘要/段落限定词可对上";
        }
        if (suspicious && betterIsStrong) {
          betterNumber = indexByPos[betterPos];
        }
      } else if (ref && !hasText) {
        reason = "该条几乎无可对照文本（无摘要且题录过短）";
        refTitle = ref.title?.trim() || undefined;
      } else {
        reason = "项目文献池中无此编号（应由硬检报越界）";
      }

      const hit: CitationGroundingHit = {
        number: num,
        overlap: Math.round(overlap * 1000) / 1000,
        suspicious,
        groundable,
        citedSentence: sentence.slice(0, 160),
        refTitle: refTitle?.slice(0, 120),
        reason,
        betterNumber,
      };

      const prev = bestByNumber.get(num);
      if (!prev || hit.overlap < prev.overlap || (hit.suspicious && !prev.suspicious)) {
        bestByNumber.set(num, hit);
      }
    }
  }

  return Array.from(bestByNumber.values()).sort((a, b) => a.number - b.number);
}

export function extractCitationContext(text: string, position: number): string {
  // 优先取含引用的整句（按 。！？；;\n 切），避免 ±window 吞进邻句造成假阴性/假阳性
  const before = text.slice(0, position);
  const after = text.slice(position);
  const startRel = Math.max(
    before.lastIndexOf("。"),
    before.lastIndexOf("！"),
    before.lastIndexOf("？"),
    before.lastIndexOf("；"),
    before.lastIndexOf(";"),
    before.lastIndexOf("\n"),
  );
  const endCandidates = ["。", "！", "？", "；", ";", "\n"]
    .map((ch) => after.indexOf(ch))
    .filter((i) => i >= 0);
  const endRel = endCandidates.length > 0 ? Math.min(...endCandidates) : -1;

  const start = startRel >= 0 ? startRel + 1 : Math.max(0, position - 60);
  const end =
    endRel >= 0
      ? position + endRel + 1
      : Math.min(text.length, position + 80);

  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function buildRefMap(references: CitationGroundingRef[]): Map<number, CitationGroundingRef> {
  const map = new Map<number, CitationGroundingRef>();
  for (const r of references) {
    const idx = Math.floor(Number(r.index));
    if (idx >= 1) map.set(idx, r);
  }
  return map;
}

export function computeSoftGroundPoolStats(
  references: CitationGroundingRef[],
  citedNumbers: Iterable<number>,
): SoftGroundPoolStats {
  const cited = new Set(
    [...citedNumbers].filter((n) => Number.isFinite(n) && n >= 1),
  );
  const softIndexes: number[] = [];
  for (const r of references) {
    const idx = Math.floor(Number(r.index));
    if (idx < 1) continue;
    if (isSoftGroundable(r.abstract)) softIndexes.push(idx);
  }
  const softUnusedIndexes = softIndexes.filter((i) => !cited.has(i));
  const softGroundableCount = softIndexes.length;
  const softCitedCount = softIndexes.length - softUnusedIndexes.length;
  return {
    softGroundableCount,
    softCitedCount,
    softUnusedCount: softUnusedIndexes.length,
    softUnusedIndexes: softUnusedIndexes.slice(0, 20),
    unusedRatio:
      softGroundableCount > 0
        ? Math.round((softUnusedIndexes.length / softGroundableCount) * 1000) / 1000
        : null,
  };
}

function buildHint(report: Omit<CitationGroundingReport, "hint">): string {
  const parts: string[] = [];
  if (report.checkedCount === 0) {
    parts.push("正文无 [n] 引用，跳过语义接地");
  } else if (report.suspiciousCount === 0) {
    parts.push(
      `语义接地：检查 ${report.checkedCount} 个编号，未见明显低重叠可疑引用`,
    );
  } else {
    const sample = report.hits
      .filter((h) => h.suspicious)
      .slice(0, 5)
      .map((h) => h.number)
      .join(", ");
    parts.push(
      `错引硬门：${report.suspiciousCount}/${report.checkedCount} 个编号的句子对不上该篇文献（如 [${sample}]），必须改号或删引后才能导出`,
    );
  }
  if (report.ungroundableCount > 0) {
    parts.push(`${report.ungroundableCount} 条缺摘要/题录过短，无法语义判定`);
  }
  const soft = report.softPool;
  if (soft.softGroundableCount > 0 && soft.unusedRatio != null && soft.unusedRatio >= 0.5) {
    parts.push(
      `soft-grounded 池 ${soft.softGroundableCount} 篇中有 ${soft.softUnusedCount} 篇正文未引用（可考虑综述段使用）`,
    );
  }
  return parts.join("；");
}

/**
 * 评估正文引用相对「各自」参考文献的语义重叠。
 * 可判定的错引（suspicious）阻断导出；缺摘要 ungroundable 不阻断。
 */
export function evaluateCitationGrounding(
  input: CitationGroundingInput,
): CitationGroundingReport {
  const threshold = input.overlapThreshold ?? DEFAULT_OVERLAP_THRESHOLD;
  const maxSuspicious = input.maxSuspicious ?? DEFAULT_MAX_SUSPICIOUS;
  const refMap = buildRefMap(input.references);
  const allHits = collectPerNumberHits(input.draftText ?? "", refMap, threshold);

  const suspicious = allHits.filter((h) => h.suspicious);
  const ungroundable = allHits.filter((h) => !h.groundable);
  const softPool = computeSoftGroundPoolStats(
    input.references,
    allHits.map((h) => h.number),
  );

  const hits = [
    ...suspicious.slice(0, maxSuspicious),
    ...allHits
      .filter((h) => !h.suspicious && !h.groundable)
      .slice(0, Math.max(0, 4)),
  ];

  const base = {
    checkedCount: allHits.length,
    suspiciousCount: suspicious.length,
    ungroundableCount: ungroundable.length,
    blocksExport: suspicious.length > 0,
    hits,
    softPool,
  };

  return {
    ...base,
    hint: buildHint(base),
  };
}

/** 从 ReferenceRowLite / SoftEvidence 行构造 grounding 输入 */
export function refsFromLiteRows(
  rows: Array<{
    order: number;
    title?: string | null;
    abstract?: string | null;
    content?: string | null;
  }>,
): CitationGroundingRef[] {
  return rows.map((r) => ({
    index: r.order + 1,
    title: r.title,
    abstract: r.abstract,
    content: r.content,
  }));
}

export { MIN_ABSTRACT_CHARS_FOR_GROUNDING };
