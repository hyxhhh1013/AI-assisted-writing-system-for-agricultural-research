/**
 * WRITE-QA-010：引言 / 结果 / 综述子节剖面。
 * 确定性规则，不进 writing.ts 禁令表。
 */

import type { SectionSpecV1 } from "@/contracts/section-spec";
import { registerFromSectionKey } from "@/contracts/section-spec";
import type { WritingQaFinding } from "@/contracts/writing-qa";
import { termOverlapRatio } from "@/lib/citation-grounding";

export const WRITE_QA_PROFILE_IDS = [
  "introduction",
  "results",
  "literature_body",
] as const;

export type WriteQaProfileId = (typeof WRITE_QA_PROFILE_IDS)[number];

const INTRO_GAP_RE = /尚不清楚|证据不足|结果不一致|鲜有报道|仍不清楚|有待|尚缺|研究不足/;
const REVIEW_TRIAL_RE = /本研究.{0,12}(田间|试验|处理组|对照|小区)|处理组.{0,8}(显著|产量)|本试验/;
const HAS_DIGIT_RE = /\d/;
const PROFILE_MIN_CHARS = 24;

export interface CollectWritingProfileFindingsInput {
  text: string;
  sectionKey?: string;
  subsectionTitle?: string;
  spec?: SectionSpecV1 | null;
}

/** 剖面附加 findings；与语域 QA 合并，不覆盖已有 code。 */
export function collectWritingProfileFindings(
  input: CollectWritingProfileFindingsInput,
): WritingQaFinding[] {
  const text = typeof input.text === "string" ? input.text : "";
  const key = input.sectionKey ?? input.spec?.sectionKey;
  const register = key ? registerFromSectionKey(key) : input.spec?.register ?? null;
  const findings: WritingQaFinding[] = [];

  if (register === "introduction" || key === "introduction") {
    if (text.trim().length >= PROFILE_MIN_CHARS && !INTRO_GAP_RE.test(text)) {
      findings.push({
        code: "intro_gap_missing",
        layer: "L4",
        action: "warn",
        message: "引言未见缺口句（尚不清楚/证据不足/结果不一致等）",
        count: 1,
      });
    }
  }

  if (register === "results" || key === "results") {
    if (text.trim().length >= PROFILE_MIN_CHARS && !HAS_DIGIT_RE.test(text)) {
      findings.push({
        code: "results_no_quantity",
        layer: "L1",
        action: "warn",
        message: "结果节没有可核对的数量，报告观察时应带数字或图表编号",
        count: 1,
      });
    }
  }

  if (register === "review_body" || key === "literature_body") {
    if (REVIEW_TRIAL_RE.test(text)) {
      findings.push({
        code: "review_as_experiment",
        layer: "L1",
        action: "repair",
        message: "综述子节写成了「本研究」试验报告，应改为转述已有文献",
        count: 1,
        examples: ["本研究"],
      });
    }
  }

  const spec = input.spec;
  if (spec && spec.claimCards.length > 0 && text.trim().length >= PROFILE_MIN_CHARS) {
    const missed = spec.claimCards.filter(
      (card) => termOverlapRatio(card.claim, text) < 0.12,
    );
    if (missed.length > 0) {
      findings.push({
        code: "blueprint_claim_uncovered",
        layer: "L4",
        action: "warn",
        message: `${missed.length} 张主张在正文中对齐偏弱（${missed.map((c) => c.id).join("、")}）`,
        count: missed.length,
        examples: missed.slice(0, 3).map((c) => c.id),
      });
    }
  }

  return findings;
}

export function isWriteQaProfileId(value: string): value is WriteQaProfileId {
  return (WRITE_QA_PROFILE_IDS as readonly string[]).includes(value);
}
