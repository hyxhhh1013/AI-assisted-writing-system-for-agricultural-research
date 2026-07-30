/**
 * W3-AP-CITE-GROUND — 编号合法前提下，对照「该条」题录/摘要做词重叠语义检查。
 * 默认 warn，不阻断导出（硬门禁仍在 citation-gate）。
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

const DEFAULT_OVERLAP_THRESHOLD = 0.12;
const DEFAULT_MAX_SUSPICIOUS = 12;
/** 题录/摘要合计少于此长度则标 ungroundable（无法判语义） */
const MIN_REF_TEXT_CHARS = 40;

export function extractKeyTerms(text: string): Set<string> {
  const terms = new Set<string>();
  const englishWords = text.toLowerCase().match(/[a-z]{3,}/g);
  if (englishWords) englishWords.forEach((w) => terms.add(w));
  // 中文只用 bigram，避免单字「度/下/了」造成跨主题假重叠
  const chineseChars = text.replace(/[^一-龥]/g, "");
  for (let i = 0; i < chineseChars.length - 1; i++) {
    terms.add(chineseChars.substring(i, i + 2));
  }
  return terms;
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

function refCorpus(ref: CitationGroundingRef): string {
  return [ref.title, ref.abstract, ref.content]
    .filter((s): s is string => Boolean(s && String(s).trim()))
    .join("\n");
}

function isRefGroundable(ref: CitationGroundingRef | undefined): boolean {
  if (!ref) return false;
  const corpus = refCorpus(ref).replace(/\s+/g, " ").trim();
  if (corpus.length < MIN_REF_TEXT_CHARS) return false;
  return true;
}

/** 句与题录需同脚本足够多，否则中文正文对英文摘要易误报 */
function sameScriptComparable(sentence: string, corpus: string): boolean {
  const zhS = (sentence.match(/[一-龥]/g) || []).length;
  const zhC = (corpus.match(/[一-龥]/g) || []).length;
  const enS = (sentence.match(/[a-zA-Z]{3,}/g) || []).length;
  const enC = (corpus.match(/[a-zA-Z]{3,}/g) || []).length;
  return (zhS >= 4 && zhC >= 4) || (enS >= 2 && enC >= 2);
}

function extractCitationContext(text: string, position: number): string {
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

/** 每个 [n] 出现一次记一条（同号多次只保留最低 overlap） */
function collectPerNumberHits(
  draftText: string,
  refMap: Map<number, CitationGroundingRef>,
  threshold: number,
): CitationGroundingHit[] {
  const normalized = normalizeAllCitationFormats(draftText);
  const bestByNumber = new Map<number, CitationGroundingHit>();
  const re = new RegExp(CITATION_GROUP_RE.source, CITATION_GROUP_RE.flags);
  let m: RegExpExecArray | null;

  while ((m = re.exec(normalized)) !== null) {
    const nums = expandCitationGroup(m[1]);
    const sentence = extractCitationContext(normalized, m.index);
    for (const num of nums) {
      if (num < 1) continue;
      const ref = refMap.get(num);
      const hasText = isRefGroundable(ref);
      let overlap = 1;
      let reason = "无可用题录/摘要，跳过语义判定";
      let refTitle: string | undefined;
      let groundable = false;

      if (ref && hasText) {
        const corpus = refCorpus(ref);
        refTitle = ref.title?.trim() || undefined;
        if (!sameScriptComparable(sentence, corpus)) {
          groundable = false;
          reason = "正文与题录/摘要脚本不一致（如中文句对英文摘要），跳过自动语义判定";
        } else {
          groundable = true;
          overlap = termOverlapRatio(sentence, corpus);
          reason =
            overlap >= threshold
              ? "句意与该条题录/摘要词重叠达标"
              : "句意与该条题录/摘要词重叠偏低，可能错引或空泛挂靠";
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
        suspicious: groundable && overlap < threshold,
        groundable,
        citedSentence: sentence.slice(0, 160),
        refTitle: refTitle?.slice(0, 120),
        reason,
      };

      const prev = bestByNumber.get(num);
      if (!prev || hit.overlap < prev.overlap) {
        bestByNumber.set(num, hit);
      }
    }
  }

  return Array.from(bestByNumber.values()).sort((a, b) => a.number - b.number);
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
      `语义接地：${report.suspiciousCount}/${report.checkedCount} 个编号与对应题录/摘要重叠偏低（如 [${sample}]），请人工核对或改引`,
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
 * 不替代编号硬检；可疑项默认不阻断 exportReady。
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
