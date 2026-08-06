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
import { analyzeReflection, MAX_REFLECT_ROUNDS } from "@/lib/agent/core/reflect";
import type { LLMMessage, ParsedToolCall, ToolObservation } from "@/lib/agent/types";

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
  /** 反思（self-refine）轮数：写完未自查时轻推，工具一有进展即重置 */
  reflectCount: Annotation<number>({
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
  /** 结构化工具结果（完成度判断用；toolSummaries 保留给 UI/摘要展示） */
  observations: Annotation<ToolObservation[]>({
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

export type AgentGraphRoute = "tools" | "finalize" | "agent" | "reflect";

/**
 * 计划驱动的续跑上限：Agent 在 plan 未完成时提前结束，可被轻推继续。
 * 该计数只在「Agent 停下来且未调工具」时递增，工具一有进展即重置（nodes.ts），
 * 故本质是「连续空停」上限，不是总轮数；用户随时可用新消息打断，
 * 真正跑完仍有 maxIterations / maxToolCalls 兜底。
 */
export const MAX_PLAN_CONTINUES = 3;

/**
 * 意图未完成时的弱续跑（检索未导入 / 写节未写回）。
 * 对话式定位：最多轻推 2 次，再不够则停下来问用户（勿伪装成流水线）。
 */
export const MAX_INTENT_CONTINUES = 2;

/**
 * 计划驱动的续跑判断（纯函数）：Agent 在 plan 未完成时提前结束，且本轮已有工具进展，
 * 返回 true 表示应注入「继续」nudge。
 *
 * 参数约定：传「本轮更新后」的值——`iteration` / `planContinueCount` 均已 +1。
 * - agentNode 在应用 update 前用 nextIteration / count+1 调用（判断是否注入 nudge）；
 * - routeAfterAgent 看到的是 agentNode 已应用的值，同样传入。
 * 两处共用同一条件，防止续跑逻辑分叉（历史上靠注释"对齐"维护）。
 */
export function shouldContinuePlanWork(state: {
  plan: AgentPlan | null;
  /** 更新后的迭代号（agentNode 传 nextIteration） */
  iteration: number;
  /** 更新后的续跑计数（agentNode 传 planContinueCount + 1） */
  planContinueCount: number;
  /** 已有工具进展（避免开局提问被强制续跑，绑架对话） */
  toolSummaries: string[];
  maxIterations: number;
}): boolean {
  return (
    planHasPendingWork(state.plan)
    && state.iteration < state.maxIterations
    && state.planContinueCount <= MAX_PLAN_CONTINUES
    && state.toolSummaries.length > 0
  );
}

/** 纯函数：agent 节点后的路由（单测友好） */
export function routeAfterAgent(state: AgentGraphStateType): AgentGraphRoute {
  if (state.error || state.awaitingCheckpoint || state.awaitingConfirm) {
    return "finalize";
  }
  if (state.pendingToolCalls.length > 0) return "tools";
  if (
    shouldContinuePlanWork({
      plan: state.plan,
      iteration: state.iteration,
      planContinueCount: state.planContinueCount,
      toolSummaries: state.toolSummaries,
      maxIterations: COST_LIMITS.maxIterations,
    })
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
  // 正常收尾：写完章节但未自查 → 进反思节点
  if (state.finished && shouldReflect(state)) {
    return "reflect";
  }
  return "finalize";
}

/** 是否需要对刚写入的内容做反思（写完自查、有问题再修） */
export function shouldReflect(state: AgentGraphStateType): boolean {
  if (state.reflectCount >= MAX_REFLECT_ROUNDS) return false;
  return analyzeReflection(state.observations).action !== null;
}

/** 反思节点后的路由：推了 nudge 就回 agent，否则收尾 */
export function routeAfterReflect(state: AgentGraphStateType): "agent" | "finalize" {
  return state.finished ? "finalize" : "agent";
}
