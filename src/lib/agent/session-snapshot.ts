import {
  emptyAgentSessionSnapshot,
  isAgentSessionSnapshot,
  type AgentSessionSnapshot,
  type AgentUiMessage,
} from "@/contracts/agent-session";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import { normalizeWorkMemory } from "@/lib/agent/work-memory";

export { emptyAgentSessionSnapshot, isAgentSessionSnapshot };

export function graphStateToSnapshot(
  state: AgentGraphStateType,
  uiTranscript?: AgentUiMessage[],
  workMemory?: import("@/lib/agent/work-memory").AgentWorkMemory | null,
  attachmentIds?: string[],
  activeWrite?: import("@/contracts/agent-session").AgentActiveWrite | null,
): AgentSessionSnapshot {
  const mem = normalizeWorkMemory(workMemory ?? null);
  return {
    version: 1,
    messages: state.messages,
    plan: state.plan,
    iteration: state.iteration,
    toolCallCount: state.toolCallCount,
    toolSummaries: state.toolSummaries,
    observations: state.observations,
    pendingToolCalls: state.pendingToolCalls,
    finished: state.finished,
    error: state.error,
    awaitingCheckpoint: state.awaitingCheckpoint ?? null,
    awaitingConfirm: state.awaitingConfirm ?? null,
    approvedCheckpointKinds: state.approvedCheckpointKinds ?? [],
    intentKind: state.intentKind ?? null,
    toolTrace: state.toolTrace,
    activeWrite: activeWrite ?? null,
    ...(uiTranscript ? { uiTranscript } : {}),
    ...(mem ? { workMemory: mem } : {}),
    ...(attachmentIds && attachmentIds.length ? { attachmentIds } : {}),
  };
}

export function snapshotToInitialState(
  goal: string,
  snapshot: AgentSessionSnapshot,
): Partial<AgentGraphStateType> {
  return {
    goal,
    messages: snapshot.messages.length > 0
      ? snapshot.messages
      : [{ role: "user", content: goal }],
    plan: snapshot.plan,
    iteration: snapshot.iteration,
    toolCallCount: snapshot.toolCallCount,
    toolSummaries: snapshot.toolSummaries,
    observations: snapshot.observations ?? [],
    pendingToolCalls: snapshot.pendingToolCalls,
    finished: false,
    error: null,
    events: [],
    finalThought: null,
    planContinueCount: 0,
    awaitingCheckpoint: null,
    awaitingConfirm: null,
    grantedConfirm: null,
    approvedCheckpointKinds: snapshot.approvedCheckpointKinds ?? [],
    intentKind: snapshot.intentKind ?? null,
    toolTrace: snapshot.toolTrace ?? [],
  };
}
