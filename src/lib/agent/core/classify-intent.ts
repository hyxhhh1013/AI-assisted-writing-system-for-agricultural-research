/**
 * 每轮只分类一次：跟聊短回复继承快照 kind，明确换任务才重判。
 * 不上 LLM。不一致只打日志。
 */

import type { IntentKind } from "@/contracts/agent-intent";
import { isApFullStyleGoal } from "@/lib/agent/core/checkpoints";
import {
  isAbstractFinishGoal,
  isAcademicPaperPipelineGoal,
  isCitationApplyGoal,
  isCitationCheckGoal,
  isDiagnoseStyleGoal,
  isLiteratureHuntGoal,
  isReferenceClassificationGoal,
  isReviewRequestGoal,
  isReviewWritingGoal,
  isSectionDraftGoal,
} from "@/lib/agent/core/goal-intents";
import type { ToolObservation } from "@/lib/agent/types";
import { createLogger } from "@/lib/logger";

const log = createLogger("agent-intent");

const FOLLOW_UP_RE =
  /^(好|好的|可以|行|开始|执行|确认|同意|继续|按方案|就这样|嗯|哦|是的|对|A|a|ok|OK|yes)[。!！?？\s]*$/;

export type IntentClassificationSource = "inherit" | "regex";

export interface IntentClassification {
  kind: IntentKind | null;
  source: IntentClassificationSource;
}

export interface ClassifyIntentInput {
  goal: string;
  observations?: readonly ToolObservation[];
  previousKind?: IntentKind | null;
}

export function looksLikeFollowUpUtterance(goal: string): boolean {
  const g = goal.trim();
  if (!g) return false;
  if (FOLLOW_UP_RE.test(g)) return true;
  return g.length <= 2 && !/写|检索|审|查|导入|分类|诊断/.test(g);
}

/**
 * 仅用当前 goal + observations 判 kind（不继承）。
 * 优先级对齐 mergeFollowUpGoalHint / mergeGoalWithIntentHint。
 */
export function classifyIntentFromRegex(
  goal: string,
  observations: readonly ToolObservation[] = [],
): IntentKind | null {
  if (isAcademicPaperPipelineGoal(goal) || isApFullStyleGoal(goal)) return "ap_full";
  if (isCitationApplyGoal(goal, observations)) return "citation_apply";
  if (isDiagnoseStyleGoal(goal)) return "diagnose";
  if (isCitationCheckGoal(goal)) return "citation";
  if (isReferenceClassificationGoal(goal)) return "classify";
  if (isAbstractFinishGoal(goal)) return "abstract_finish";
  if (isReviewRequestGoal(goal)) return "review_request";
  if (isLiteratureHuntGoal(goal)) return "literature";
  if (isReviewWritingGoal(goal)) return "review_write";
  if (isSectionDraftGoal(goal)) return "draft";
  return null;
}

export function classifyIntent(input: ClassifyIntentInput): IntentClassification {
  const goal = input.goal.trim();
  const observations = input.observations ?? [];
  const previousKind = input.previousKind ?? null;

  const fromGoal = classifyIntentFromRegex(goal, []);
  const fromObs = classifyIntentFromRegex(goal, observations);
  if (fromGoal !== fromObs) {
    log.info("intent regex goal vs observations", {
      goal: goal.slice(0, 80),
      fromGoal,
      fromObs,
    });
  }

  if (previousKind && looksLikeFollowUpUtterance(goal)) {
    const switchKind = classifyIntentFromRegex(goal, []);
    if (switchKind == null || switchKind === previousKind) {
      if (fromObs != null && fromObs !== previousKind) {
        log.info("intent inherit vs observations", {
          goal: goal.slice(0, 80),
          inherited: previousKind,
          fromObs,
        });
      }
      return { kind: previousKind, source: "inherit" };
    }
  }

  return { kind: fromObs ?? fromGoal, source: "regex" };
}
