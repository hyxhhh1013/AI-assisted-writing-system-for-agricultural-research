import type { AgentSessionSnapshot } from "@/contracts/agent-session";
import { snapshotToInitialState } from "@/lib/agent/session-snapshot";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { LLMMessage } from "@/lib/agent/types";

const MAX_HISTORY_MESSAGES = 40;

/**
 * 同一会话跟聊：保留历史消息，追加新用户目标，并重置本轮预算相关计数。
 */
export function buildFollowUpInitialState(
  newGoal: string,
  snapshot: AgentSessionSnapshot,
): Partial<AgentGraphStateType> {
  const goal = newGoal.trim();
  const base = snapshotToInitialState(goal, snapshot);
  const history = clipMessages(base.messages ?? [], MAX_HISTORY_MESSAGES);

  return {
    ...base,
    goal,
    messages: [...history, { role: "user", content: goal }],
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
    toolSummaries: (base.toolSummaries ?? []).slice(-20),
    observations: (base.observations ?? []).slice(-20),
  };
}

export function clipMessages(messages: LLMMessage[], max: number): LLMMessage[] {
  if (messages.length <= max) return messages;
  return messages.slice(messages.length - max);
}
