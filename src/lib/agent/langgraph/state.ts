import { Annotation } from "@langchain/langgraph";
import type {
  AgentCheckpointKind,
  AgentCheckpointRequest,
  AgentConfirmRequest,
  AgentPlan,
  AgentSSEEvent,
} from "@/contracts/agent";
import { COST_LIMITS } from "@/lib/agent/core/safety";
import { planHasPendingWork } from "@/lib/agent/core/plan-progress";
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
  planContinueCount: Annotation<number>({
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
  awaitingCheckpoint: Annotation<AgentCheckpointRequest | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  awaitingConfirm: Annotation<AgentConfirmRequest | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  /** 服务端授予的一次性确认（模型自带 userConfirmed 无效） */
  grantedConfirm: Annotation<import("@/lib/agent/core/confirm-grant").GrantedConfirm | null>({
    reducer: (_, next) => next,
    default: () => null,
  }),
  approvedCheckpointKinds: Annotation<AgentCheckpointKind[]>({
    reducer: (_, next) => next,
    default: () => [],
  }),
});

export type AgentGraphStateType = typeof AgentGraphState.State;

export type AgentGraphRoute = "tools" | "finalize" | "agent";

export const MAX_PLAN_CONTINUES = 0;

/**
 * 意图未完成时的弱续跑（检索未导入 / 写节未写回）。
 * 综述需多轮搜+分批导满 ~30 篇，原 2 次续跑不够。
 */
export const MAX_INTENT_CONTINUES = 10;

/** 纯函数：agent 节点后的路由（单测友好） */
export function routeAfterAgent(state: AgentGraphStateType): AgentGraphRoute {
  if (state.error || state.finished || state.awaitingCheckpoint || state.awaitingConfirm) {
    return "finalize";
  }
  if (state.pendingToolCalls.length > 0) return "tools";
  if (
    planHasPendingWork(state.plan)
    && state.iteration < COST_LIMITS.maxIterations
    && state.planContinueCount < MAX_PLAN_CONTINUES
  ) {
    return "agent";
  }
  // 意图续跑：agentNode 已注入 nudge 且 finished=false
  if (
    state.planContinueCount > 0
    && state.planContinueCount <= MAX_INTENT_CONTINUES
    && state.iteration < COST_LIMITS.maxIterations
  ) {
    return "agent";
  }
  return "finalize";
}
