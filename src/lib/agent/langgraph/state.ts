import { Annotation } from "@langchain/langgraph";
import type { AgentPlan, AgentSSEEvent } from "@/contracts/agent";
import type { LLMMessage, ParsedToolCall } from "@/lib/agent/types";

export const AgentGraphState = Annotation.Root({
  goal: Annotation<string>({
    reducer: (_, next) => next,
    default: () => "",
  }),
  plan: Annotation<AgentPlan | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  messages: Annotation<LLMMessage[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  iteration: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  toolCallCount: Annotation<number>({
    reducer: (_, next) => next,
    default: () => 0,
  }),
  finalThought: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  toolSummaries: Annotation<string[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
  pendingToolCalls: Annotation<ParsedToolCall[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
  finished: Annotation<boolean>({
    reducer: (_, next) => next,
    default: () => false,
  }),
  error: Annotation<string | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  events: Annotation<AgentSSEEvent[]>({
    reducer: (left, right) => left.concat(right),
    default: () => [],
  }),
});

export type AgentGraphStateType = typeof AgentGraphState.State;

export type AgentGraphRoute = "tools" | "finalize";

/** 纯函数：agent 节点后的路由（单测友好） */
export function routeAfterAgent(state: AgentGraphStateType): AgentGraphRoute {
  if (state.error || state.finished) return "finalize";
  if (state.pendingToolCalls.length > 0) return "tools";
  return "finalize";
}
