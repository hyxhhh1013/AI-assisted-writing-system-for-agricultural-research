/**
 * WRITE-QA-003 / 006：写节热路径确定性质检。
 * persist 只看 verdict=block（number_not_in_claims 等）；repair 仍写回。
 */

import {
  registerFromSectionKey,
  type SectionRegister,
} from "@/contracts/section-spec";
import {
  liftWritingQualityFindings,
  verdictFromWritingFindings,
  writingQaVerdictLabel,
  type WritingQaFinding,
  type WritingQaReport,
} from "@/contracts/writing-qa";
import type { EvidenceClaim } from "@/contracts/data-source";
import type { SectionSpecV1 } from "@/contracts/section-spec";
import { checkWritingQuality } from "@/lib/agent/writing-quality";
import { collectWritingProfileFindings } from "@/lib/agent/writing-profiles";
import { reconcileResultsNumbers } from "@/lib/agent/results-number-reconcile";
import { collectInvalidCitationNumbers } from "@/lib/reference-reorder";

const HOLLOW_PHRASES = [
  "具有重要的意义",
  "展现出较大的潜力",
  "引起了广泛关注",
  "日益严峻",
  "填补了空白",
  "具有广阔的应用前景",
];

const HOLLOW_REGEXES = [
  /随着[^。\n]{0,12}的发展/g,
  /在[^。\n]{0,12}背景下/g,
];

const RESULTS_BLEED_PHRASES = [
  "可能反映",
  "或许由于",
  "或许是由于",
  "可能是由于",
  "尚需进一步验证",
  "这可能意味着",
];

const INLINE_CITE_RE = /\[(\d+)(?:\s*[-–,，]\s*\d+)*\]/;
const MD_HEADING_RE = /^#{1,6}\s/m;
const EMBEDDED_BIB_RE =
  /(?:^|\n)\s*(?:#{1,3}\s*)?(?:\*{0,2}参考文献\*{0,2}|References)\s*(?:\n|$)/;

const HOLLOW_MIN = 2;
const SENTENCE_RUN = 5;
const SENTENCE_BAND = 6;
const SENTENCE_MIN_LEN = 12;

export const WRITING_QA_HOLLOW_PHRASES = HOLLOW_PHRASES;
export const WRITING_QA_HOLLOW_REGEXES = HOLLOW_REGEXES;
export const WRITING_QA_BLEED_PHRASES = RESULTS_BLEED_PHRASES;

export interface EvaluateSectionWritingQaInput {
  text: string;
  sectionKey?: string;
  extraFindings?: WritingQaFinding[];
  /** 项目文献上限（含本次新增）；>0 时检测 cite_oob */
  maxRefIndex?: number;
  /** 结果节精确数字对账；对不上 → number_not_in_claims (block) */
  dataClaims?: EvidenceClaim[];
  /** 010 剖面 / 主张覆盖 */
  spec?: SectionSpecV1 | null;
  subsectionTitle?: string;
}

function countPhrases(text: string, phrases: string[]): { count: number; examples: string[] } {
  let count = 0;
  const examples: string[] = [];
  for (const phrase of phrases) {
    let idx = 0;
    while ((idx = text.indexOf(phrase, idx)) !== -1) {
      count += 1;
      if (examples.length < 3) examples.push(phrase);
      idx += phrase.length;
    }
  }
  return { count, examples };
}

function countRegexes(text: string, regexes: RegExp[]): { count: number; examples: string[] } {
  let count = 0;
  const examples: string[] = [];
  for (const re of regexes) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    const copy = new RegExp(re.source, flags);
    let m: RegExpExecArray | null;
    while ((m = copy.exec(text)) !== null) {
      count += 1;
      if (examples.length < 3) examples.push(m[0]);
      if (m[0].length === 0) copy.lastIndex += 1;
    }
  }
  return { count, examples };
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；.!?])\s*/)
    .map((s) => s.trim())
    .filter((s) => s.length >= SENTENCE_MIN_LEN);
}

function hasSentenceMonotone(text: string): boolean {
  const lengths = splitSentences(text).map((s) => s.length);
  if (lengths.length < SENTENCE_RUN) return false;
  for (let i = 0; i <= lengths.length - SENTENCE_RUN; i += 1) {
    const window = lengths.slice(i, i + SENTENCE_RUN);
    if (Math.max(...window) - Math.min(...window) <= SENTENCE_BAND) return true;
  }
  return false;
}

function collectSectionFindings(
  text: string,
  register: SectionRegister | null,
): WritingQaFinding[] {
  const findings: WritingQaFinding[] = [];

  const hollowPhrases = countPhrases(text, HOLLOW_PHRASES);
  const hollowRe = countRegexes(text, HOLLOW_REGEXES);
  const hollowCount = hollowPhrases.count + hollowRe.count;
  const hollowExamples = [...hollowPhrases.examples, ...hollowRe.examples].slice(0, 3);
  if (hollowCount >= HOLLOW_MIN) {
    findings.push({
      code: "hollow_phrase",
      layer: "L2",
      action: "repair",
      message: `空话套话（${hollowCount} 处：${hollowExamples.join("、")}），建议换成具体事实`,
      count: hollowCount,
      examples: hollowExamples,
    });
  }

  if (register === "results") {
    const bleed = countPhrases(text, RESULTS_BLEED_PHRASES);
    if (bleed.count >= 1) {
      findings.push({
        code: "results_discussion_bleed",
        layer: "L1",
        action: "repair",
        message: `结果节混入讨论句式（${bleed.count} 处：${bleed.examples.join("、")}）`,
        count: bleed.count,
        examples: bleed.examples,
      });
    }
  }

  if (register === "abstract" && INLINE_CITE_RE.test(text)) {
    findings.push({
      code: "abstract_has_cite",
      layer: "L1",
      action: "repair",
      message: "摘要出现文内引用 [n]，摘要不应标注文献编号",
      count: 1,
    });
  }

  if (MD_HEADING_RE.test(text)) {
    findings.push({
      code: "md_heading",
      layer: "L1",
      action: "repair",
      message: "正文使用了 Markdown 标题（#），应改为纯文本编号小标题",
      count: 1,
    });
  }

  const tail = text.slice(-600);
  if (EMBEDDED_BIB_RE.test(tail)) {
    findings.push({
      code: "embedded_bib",
      layer: "L1",
      action: "repair",
      message: "章节末尾含「参考文献 / References」列表，文献表应只在项目侧栏维护",
      count: 1,
    });
  }

  if (hasSentenceMonotone(text)) {
    findings.push({
      code: "sentence_monotone",
      layer: "L2",
      action: "warn",
      message: "连续多句长度过齐，读起来像模板句",
      count: SENTENCE_RUN,
    });
  }

  return findings;
}

function collectNumberClaimFindings(
  text: string,
  register: SectionRegister | null,
  claims?: EvidenceClaim[],
): WritingQaFinding[] {
  if (register !== "results" || !claims?.length) return [];
  const recon = reconcileResultsNumbers(text, claims);
  if (recon.ok) return [];
  return [
    {
      code: "number_not_in_claims",
      layer: "L0",
      action: "block",
      message: recon.message,
      count: recon.offenders.length,
      examples: recon.offenders.slice(0, 3).map((o) => o.raw),
    },
  ];
}

function collectCiteOobFindings(text: string, maxRefIndex?: number): WritingQaFinding[] {
  if (!maxRefIndex || maxRefIndex < 1) return [];
  const oob = collectInvalidCitationNumbers(text, maxRefIndex);
  if (oob.length === 0) return [];
  return [
    {
      code: "cite_oob",
      layer: "L0",
      action: "repair",
      message: `越界引用 ${oob.map((n) => `[${n}]`).join(" ")}（池内 1–${maxRefIndex}）`,
      count: oob.length,
      examples: oob.slice(0, 3).map((n) => `[${n}]`),
    },
  ];
}

/** 对一节正文跑确定性 QA。不调 LLM，不阻断写回。 */
function asQaText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function evaluateSectionWritingQa(
  input: EvaluateSectionWritingQaInput,
): WritingQaReport {
  const text = asQaText(input.text);
  const register = input.sectionKey ? registerFromSectionKey(input.sectionKey) : null;
  const lifted = liftWritingQualityFindings(checkWritingQuality(text), {
    sectionKey: input.sectionKey,
    charCount: text.length,
  });
  const extras = [
    ...collectSectionFindings(text, register),
    ...collectCiteOobFindings(text, input.maxRefIndex),
    ...collectNumberClaimFindings(text, register, input.dataClaims),
    ...collectWritingProfileFindings({
      text,
      sectionKey: input.sectionKey,
      subsectionTitle: input.subsectionTitle,
      spec: input.spec,
    }),
    ...(input.extraFindings ?? []),
  ];
  const seen = new Set(lifted.findings.map((f) => f.code));
  const findings = [...lifted.findings];
  for (const extra of extras) {
    if (seen.has(extra.code)) continue;
    findings.push(extra);
    seen.add(extra.code);
  }
  return {
    verdict: verdictFromWritingFindings(findings),
    findings,
    sectionKey: input.sectionKey,
    charCount: text.length,
  };
}

export function appendQaNoteToSummary(summary: string, report: WritingQaReport): string {
  if (report.findings.length === 0) return `${summary} · 文风质检通过`;
  if (report.verdict === "block") {
    return `${summary} · 文风质检 ${report.findings.length} 条（${writingQaVerdictLabel(report.verdict)}，未写入章节）`;
  }
  return `${summary} · 文风质检 ${report.findings.length} 条（${writingQaVerdictLabel(report.verdict)}，不阻断写回）`;
}
