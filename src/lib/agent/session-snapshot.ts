import {
  emptyAgentSessionSnapshot,
  isAgentSessionSnapshot,
  type AgentSessionSnapshot,
} from "@/contracts/agent-session";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";

export { emptyAgentSessionSnapshot, isAgentSessionSnapshot };

export function graphStateToSnapshot(state: AgentGraphStateType): AgentSessionSnapshot {
  return {
    version: 1,
    messages: state.messages,
    plan: state.plan,
    iteration: state.iteration,
    toolCallCount: state.toolCallCount,
    toolSummaries: state.toolSummaries,
    pendingToolCalls: state.pendingToolCalls,
    finished: state.finished,
    error: state.error,
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
    pendingToolCalls: snapshot.pendingToolCalls,
    finished: false,
    error: null,
    events: [],
    finalThought: null,
  };
}
