/**
 * 何时跑 LLM claim grounding：收口路径默认开；写节 reflect 自查默认关。
 * `CITATION_CLAIM_GROUNDING=0` 全局关闭。
 */

import type { IntentKind } from "@/contracts/agent-intent";
import { isApFullStyleGoal } from "@/lib/agent/core/checkpoints";
import {
  isAbstractFinishGoal,
  isAcademicPaperPipelineGoal,
  isCitationCheckGoal,
  isReviewRequestGoal,
} from "@/lib/agent/core/goal-intents";

const CLOSE_OUT_KINDS: ReadonlySet<IntentKind> = new Set([
  "citation",
  "citation_apply",
  "abstract_finish",
  "review_request",
  "ap_full",
  "pipeline_fix",
  "pipeline_abstract",
  "pipeline_review",
  "pipeline_check",
]);

export function isCitationClaimGroundingCloseOut(
  goal: string,
  intentKind?: IntentKind | null,
): boolean {
  if (intentKind) return CLOSE_OUT_KINDS.has(intentKind);
  const g = goal.trim();
  if (!g) return true;
  return (
    isCitationCheckGoal(g)
    || isAbstractFinishGoal(g)
    || isReviewRequestGoal(g)
    || isAcademicPaperPipelineGoal(g)
    || isApFullStyleGoal(g)
  );
}

export function shouldRunCitationClaimGrounding(input: {
  hasAbstracts: boolean;
  env?: string;
  closeOut: boolean;
}): boolean {
  if (!input.hasAbstracts) return false;
  if (!input.closeOut) return false;
  const raw = (input.env ?? process.env.CITATION_CLAIM_GROUNDING ?? "").trim().toLowerCase();
  if (raw === "0" || raw === "false" || raw === "off") return false;
  return true;
}
