/**
 * WRITE-QA-005：qaReport findings → 正文确定性补丁（纯函数）。
 * 不做 LLM。灰区交给 writing-patch-run 最多 1 次定向 refine。
 */

import { stripInlineCitations } from "@/lib/abstract-utils";
import type { WritingQaFinding } from "@/contracts/writing-qa";
import {
  CONNECTIVE_PHRASES,
  OVERCLAIM_PHRASES,
  THROAT_CLEAR_PHRASES,
} from "@/lib/agent/writing-quality";
import {
  WRITING_QA_BLEED_PHRASES,
  WRITING_QA_HOLLOW_PHRASES,
  WRITING_QA_HOLLOW_REGEXES,
} from "@/lib/agent/writing-qa-run";
import {
  stripDisallowedCitations,
  stripEmbeddedBibliography,
  stripOutOfRangeCitations,
} from "@/lib/reference-reorder";

const DETERMINISTIC_CODES = new Set([
  "cite_oob",
  "abstract_has_cite",
  "throat_clear",
  "hollow_phrase",
  "results_discussion_bleed",
  "embedded_bib",
  "md_heading",
  "overclaim",
  "review_as_experiment",
  "claim_id_heading",
  "evidence_unbound",
]);

const BLEED_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["这可能意味着", "结果显示"],
  ["可能是由于", "伴随"],
  ["或许是由于", "伴随"],
  ["或许由于", "伴随"],
  ["可能反映", "观察到"],
  ["尚需进一步验证", ""],
];

const OVERCLAIM_REPLACEMENTS: ReadonlyArray<readonly [string, string]> = [
  ["显著优于一切", "在本试验中更高"],
  ["毫无疑问", "现有数据表明"],
  ["毋庸置疑", "现有数据表明"],
  ["独一无二", "较为少见"],
  ["必定", "倾向于"],
];

export interface WritingPatch {
  code: string;
  beforeExcerpt: string;
  afterExcerpt: string;
}

export interface ApplyWritingPatchesInput {
  maxRefIndex?: number;
  sectionKey?: string;
  /** 主张已绑的 [n]；空数组表示未绑，剥掉全部文内引用 */
  allowedCiteNs?: readonly number[];
}

export interface ApplyWritingPatchesResult {
  draft: string;
  patches: WritingPatch[];
  remainingRepairCodes: string[];
}

export function isDeterministicWritingPatch(code: string): boolean {
  return DETERMINISTIC_CODES.has(code);
}

function excerptAround(text: string, needle: string, radius = 20): string {
  const i = text.indexOf(needle);
  if (i < 0) return needle.slice(0, 48);
  return text.slice(Math.max(0, i - radius), Math.min(text.length, i + needle.length + radius));
}

function tidyPunctuation(text: string): string {
  return text
    .replace(/([。！？\n]|^)\s*[，、；]\s*/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([，。；、,.!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n");
}

function stripPhrases(text: string, phrases: readonly string[]): string {
  let out = text;
  const sorted = [...phrases].sort((a, b) => b.length - a.length);
  for (const phrase of sorted) {
    if (!phrase) continue;
    out = out.split(phrase).join("");
  }
  return tidyPunctuation(out);
}

function stripHollowRegexes(text: string): string {
  let out = text;
  for (const re of WRITING_QA_HOLLOW_REGEXES) {
    const flags = re.flags.includes("g") ? re.flags : `${re.flags}g`;
    out = out.replace(new RegExp(re.source, flags), "");
  }
  return tidyPunctuation(out);
}

function applyReplacements(
  text: string,
  pairs: ReadonlyArray<readonly [string, string]>,
): string {
  let out = text;
  for (const [from, to] of pairs) {
    out = out.split(from).join(to);
  }
  return tidyPunctuation(out);
}

function stripAbsoluteNotValue(text: string): string {
  return tidyPunctuation(text.replace(/绝对(?!值)/g, "在本试验条件下"));
}

function stripMdHeadings(text: string): string {
  return text.replace(/^#{1,6}\s+/gm, "");
}

/** 去掉段首/行首的主张卡编号，避免 C1/C2 被写成小标题。 */
export function stripClaimIdHeadings(text: string): string {
  return tidyPunctuation(
    text.replace(/^(?:#{1,6}\s*)?(?:\*{0,2}C\d+\*{0,2})(?:\s*[:：.、-]?\s+|\s+)/gm, ""),
  );
}

function recordPatch(
  patches: WritingPatch[],
  code: string,
  before: string,
  after: string,
): void {
  if (before === after) return;
  patches.push({
    code,
    beforeExcerpt: before.slice(0, 80),
    afterExcerpt: after.slice(0, 80),
  });
}

/** 只消费 action=repair 且有确定性改法的 finding。 */
export function applyWritingPatches(
  draft: string,
  findings: readonly WritingQaFinding[],
  opts: ApplyWritingPatchesInput = {},
): ApplyWritingPatchesResult {
  let next = stripClaimIdHeadings(draft);
  const patches: WritingPatch[] = [];
  const seen = new Set<string>();
  recordPatch(patches, "claim_id_heading", draft, next);
  if (next !== draft) seen.add("claim_id_heading");

  for (const finding of findings) {
    if (finding.action !== "repair") continue;
    if (!DETERMINISTIC_CODES.has(finding.code) || seen.has(finding.code)) continue;
    seen.add(finding.code);
    const before = next;

    if (finding.code === "cite_oob" && opts.maxRefIndex && opts.maxRefIndex > 0) {
      next = stripOutOfRangeCitations(next, opts.maxRefIndex);
    } else if (finding.code === "abstract_has_cite") {
      next = stripInlineCitations(next);
    } else if (finding.code === "throat_clear") {
      next = stripPhrases(next, THROAT_CLEAR_PHRASES);
    } else if (finding.code === "hollow_phrase") {
      next = stripPhrases(next, [...WRITING_QA_HOLLOW_PHRASES, ...CONNECTIVE_PHRASES]);
      next = stripHollowRegexes(next);
    } else if (finding.code === "results_discussion_bleed") {
      next = applyReplacements(next, BLEED_REPLACEMENTS);
    } else if (finding.code === "embedded_bib") {
      next = stripEmbeddedBibliography(next);
    } else if (finding.code === "md_heading") {
      if (opts.sectionKey !== "literature_body" && opts.sectionKey !== "background") {
        next = stripMdHeadings(next);
      }
    } else if (finding.code === "overclaim") {
      next = applyReplacements(next, OVERCLAIM_REPLACEMENTS);
      if (OVERCLAIM_PHRASES.includes("绝对") && before.includes("绝对")) {
        next = stripAbsoluteNotValue(next);
      }
    } else if (finding.code === "review_as_experiment") {
      next = tidyPunctuation(next.split("本研究").join("已有研究"));
    } else if (finding.code === "claim_id_heading") {
      next = stripClaimIdHeadings(next);
    } else if (finding.code === "evidence_unbound") {
      const allowed = opts.allowedCiteNs ?? [];
      if (allowed.length > 0) {
        next = stripDisallowedCitations(next, new Set(allowed));
      }
    }

    recordPatch(patches, finding.code, before, next);
  }

  const remainingRepairCodes = findings
    .filter((f) => f.action === "repair" && !seen.has(f.code))
    .map((f) => f.code);

  return { draft: next, patches, remainingRepairCodes };
}

/** 给 Refiner 的短反馈：只含 code + 片段，禁止再喂一篇散文审查。 */
export function formatWritingRefineFeedback(findings: readonly WritingQaFinding[]): string {
  const rows = findings
    .filter((f) => f.action === "repair")
    .slice(0, 4)
    .map((f) => {
      const sample = f.examples?.slice(0, 2).join("；") ?? "";
      return sample ? `${f.code}: ${f.message} | ${sample}` : `${f.code}: ${f.message}`;
    });
  return [
    "只改下列缺陷对应的句子，禁止整节重写，禁止删除已有 [n]，禁止扩写。",
    ...rows,
  ].join("\n");
}

const SKIP_REFINE_CODES = new Set([
  "blueprint_claim_uncovered",
  "evidence_unbound",
]);

export function hasWritingRefineCandidate(findings: readonly WritingQaFinding[]): boolean {
  return findings.some((f) => f.action === "repair" && !SKIP_REFINE_CODES.has(f.code));
}

export function excerptFinding(text: string, finding: WritingQaFinding): string {
  const needle = finding.examples?.[0];
  if (!needle) return finding.message.slice(0, 48);
  return excerptAround(text, needle);
}
