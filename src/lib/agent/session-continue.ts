import type { AgentSessionSnapshot } from "@/contracts/agent-session";
import { isIntentKind } from "@/contracts/agent-intent";
import { classifyIntent } from "@/lib/agent/core/classify-intent";
import { snapshotToInitialState } from "@/lib/agent/session-snapshot";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import { expandChoiceDigitGoal } from "@/lib/agent/choice-prompt-display";
import { wantsMechanismIllustration } from "@/lib/agent/figure-loop";
import type { LLMMessage } from "@/lib/agent/types";

const MAX_HISTORY_MESSAGES = 40;

/**
 * 同一会话跟聊：保留历史消息，追加新用户目标，并重置本轮预算相关计数。
 */
export function buildFollowUpInitialState(
  newGoal: string,
  snapshot: AgentSessionSnapshot,
): Partial<AgentGraphStateType> {
  const goal = expandChoiceDigitGoal(newGoal.trim(), snapshot.uiTranscript);
  const base = snapshotToInitialState(goal, snapshot);
  const history = clipMessages(base.messages ?? [], MAX_HISTORY_MESSAGES);
  const transcriptUser = (snapshot.uiTranscript ?? [])
    .flatMap((m) => (m.kind === "user" && m.text.trim() ? [m.text.trim()] : []));
  const historyWithIllustrationHint =
    wantsMechanismIllustration(goal, history, transcriptUser)
    && !wantsMechanismIllustration(goal, history)
      ? ([
          ...history,
          { role: "user", content: "【此前要求】用文生图出流程图观感候选，结构过线后必须 illustrate_mechanism_figure。" },
        ] satisfies LLMMessage[])
      : history;
  const previousKind = isIntentKind(snapshot.intentKind) ? snapshot.intentKind : null;
  const classified = classifyIntent({
    goal,
    observations: (base.observations ?? []).slice(-20),
    previousKind,
  });

  return {
    ...base,
    goal,
    intentKind: classified.kind,
    messages: [...historyWithIllustrationHint, { role: "user", content: goal }],
    plan: null,
    iteration: 0,
    toolCallCount: 0,
    planContinueCount: 0,
    pendingToolCalls: [],
    finished: false,
    error: null,
    finalThought: null,
    events: [],
    awaitingCheckpoint: null,
    awaitingConfirm: null,
    grantedConfirm: null,
    approvedCheckpointKinds: base.approvedCheckpointKinds ?? [],
    toolSummaries: [],
    observations: (base.observations ?? []).slice(-20),
    intentObsOffset: (base.observations ?? []).slice(-20).length,
  };
}

export function clipMessages(messages: LLMMessage[], max: number): LLMMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(messages.length - max);
}
