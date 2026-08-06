/**
 * toolsNode 门禁中间件：把散落在 nodes.ts 里的工具调用前后检查抽成可组合、可单测的门禁链。
 *
 * 三组求值点（顺序与 nodes.ts 原实现一致，行为保持）：
 * - evaluatePreGates   前置门禁（重复调用 / 检索配额 / 意图组）——在写前置自动补齐之前
 * - evaluatePhaseGate  阶段门禁——在写前置自动补齐之后、执行之前（原顺序如此）
 * - evaluatePostGates  后置门禁（antispam 停滞 / clarify / outline 检查点）——工具执行后
 *
 * 门禁是纯决策函数：只返回裁决，副作用（推 SSE / 记摘要 / 终止循环）由 toolsNode 编排层处理。
 */
import type { AgentCheckpointRequest, AgentToolResult } from "@/contracts/agent";
import type { AgentContext, ToolDefinition, ToolObservation } from "@/lib/agent/types";
import { checkSearchQuota, noteToolProgress } from "@/lib/agent/core/antispam";
import { checkRepeatCall } from "@/lib/agent/core/safety";
import { checkAgentToolPhaseGate } from "@/lib/agent/core/phase-gates";
import { checkReadBeforeWrite } from "@/lib/agent/core/read-before-write";
import {
  checkAbstractFinishGate,
  checkCitationCheckGate,
  checkCitationSideTripGate,
  checkDiagnoseInspectGate,
  checkDraftSearchGate,
  checkReviewRequestGate,
} from "@/lib/agent/core/goal-intents";
import {
  buildClarifyCheckpoint,
  buildOutlineCheckpoint,
  shouldPauseForOutlineApprove,
} from "@/lib/agent/core/checkpoints";
import type { AgentGraphStateType } from "./state";
import type { AntispamTracker } from "@/lib/agent/core/antispam";
import type { RepeatTracker } from "@/lib/agent/core/safety";

/** 前置门禁输入 */
export interface PreGateInput {
  tool: ToolDefinition;
  params: Record<string, unknown>;
  state: AgentGraphStateType;
  agentContext: AgentContext;
  repeatTracker: RepeatTracker;
  antispamTracker: AntispamTracker;
  /** 本会话观察（含本轮已产生），供意图/先读后写门禁用 */
  recentObservations: readonly ToolObservation[];
}

/**
 * 前置门禁裁决：
 * - soft     → 记 observation + 继续下一个工具（软提示）
 * - reject   → 记失败 + 标记计划 + 继续下一个工具（硬门禁但非致命）
 * - hard     → agent/error + 终止本轮（致命）
 */
export type GateVerdict =
  | { ok: true }
  | { ok: false; kind: "soft" | "reject" | "hard"; error: string };

export type PreToolGate = (input: PreGateInput) => GateVerdict;

/** 重复调用门禁：软工具软警告（超上限硬停），非软工具直接硬停 */
const SOFT_REPEAT_CAP = 8;
export const repeatGate: PreToolGate = ({ tool, params, repeatTracker }) => {
  const repeat = checkRepeatCall(repeatTracker, tool.name, params);
  if (repeat.allowed) return { ok: true };
  const isSoftTool =
    tool.name === "read_section"
    || tool.name === "search_knowledge"
    || tool.name === "search_external";
  const hardStop = !isSoftTool || (repeat.repeatCount ?? 0) > SOFT_REPEAT_CAP;
  return {
    ok: false,
    kind: hardStop ? "hard" : "soft",
    error: repeat.warning ?? (hardStop ? "重复调用" : "请停止重复调用，改换策略或直接回复用户"),
  };
};

/** 检索配额门禁 */
export const searchQuotaGate: PreToolGate = ({ tool, antispamTracker }) => {
  const quota = checkSearchQuota(antispamTracker, tool.name);
  return quota.allowed
    ? { ok: true }
    : { ok: false, kind: "soft", error: quota.warning ?? "检索次数已达上限" };
};

/** 意图门禁组：诊断 inspect / 草稿检索 / 引用核查 / 引用绕行 / 收口摘要 / 审查审稿 / 先读后写 */
export const intentGate: PreToolGate = ({ state, tool, params, recentObservations }) => {
  const gates: Array<() => { ok: boolean; error?: string }> = [
    () => checkDiagnoseInspectGate(state.goal, tool.name, recentObservations),
    () => checkDraftSearchGate(state.goal, tool.name, recentObservations),
    () => checkCitationCheckGate(state.goal, tool.name, recentObservations),
    () => checkCitationSideTripGate(state.goal, tool.name, recentObservations),
    () => checkAbstractFinishGate(state.goal, tool.name, recentObservations),
    () => checkReviewRequestGate(state.goal, tool.name, recentObservations),
    () => checkReadBeforeWrite(tool.name, params, recentObservations),
  ];
  for (const gate of gates) {
    const r = gate();
    if (!r.ok) return { ok: false, kind: "reject", error: r.error ?? "门禁未通过" };
  }
  return { ok: true };
};

/** 前置门禁链（在写前置自动补齐之前，按序短路） */
export const PRE_GATES: PreToolGate[] = [repeatGate, searchQuotaGate, intentGate];

export function evaluatePreGates(input: PreGateInput): GateVerdict {
  for (const gate of PRE_GATES) {
    const verdict = gate(input);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}

/** 阶段门禁（写前置自动补齐之后执行） */
export const phaseGate: PreToolGate = ({ tool, params, agentContext }) => {
  const gate = checkAgentToolPhaseGate(tool.name, params, agentContext.projectSnapshot);
  return gate.ok ? { ok: true } : { ok: false, kind: "reject", error: gate.error };
};

export function evaluatePhaseGate(input: PreGateInput): GateVerdict {
  return phaseGate(input);
}

/** 后置门禁输入 */
export interface PostGateInput {
  tool: ToolDefinition;
  result: AgentToolResult;
  state: AgentGraphStateType;
  agentContext: AgentContext;
  antispamTracker: AntispamTracker;
}

/**
 * 后置门禁裁决：
 * - break       → 记 observation + 停本轮（无实质进展，如 antispam 停滞）
 * - checkpoint  → agent/checkpoint + 暂停等用户（clarify / outline 批准）
 */
export type PostToolVerdict =
  | { ok: true }
  | { ok: false; kind: "break"; warning: string }
  | {
      ok: false;
      kind: "checkpoint";
      checkpoint: AgentCheckpointRequest;
      /** outline 批准时需同步 plan 焦点（clarify 检查点不需要，保持原行为） */
      updateFocus?: boolean;
    };

export type PostToolGate = (input: PostGateInput) => PostToolVerdict;

/** antispam 停滞：工具成功但无实质进展 → 停本轮 */
export const antispamProgressGate: PostToolGate = ({
  tool,
  result,
  agentContext,
  antispamTracker,
}) => {
  const progress = noteToolProgress(
    antispamTracker,
    tool.name,
    agentContext.projectSnapshot,
    result.success,
  );
  if (progress.stagnant && progress.warning) {
    antispamTracker.breakCount += 1;
    return { ok: false, kind: "break", warning: progress.warning };
  }
  return { ok: true };
};

/** ask_user 澄清检查点：工具返回 needClarification → 暂停等用户回答 */
export const clarifyCheckpointGate: PostToolGate = ({ result }) => {
  const clarifyData = (result.data ?? null) as {
    needClarification?: boolean;
    question?: string;
  } | null;
  if (result.success && clarifyData?.needClarification && clarifyData.question) {
    return { ok: false, kind: "checkpoint", checkpoint: buildClarifyCheckpoint(clarifyData.question) };
  }
  return { ok: true };
};

/** 大纲批准检查点：写完待批准章节且未批准过 → 暂停 */
export const outlineApproveGate: PostToolGate = ({ tool, result, state }) => {
  if (
    !shouldPauseForOutlineApprove({
      goal: state.goal,
      toolName: tool.name,
      toolSuccess: result.success,
      persisted: Boolean(
        result.data
        && typeof result.data === "object"
        && (result.data as { persisted?: unknown }).persisted !== false,
      ),
      approvedKinds: state.approvedCheckpointKinds ?? [],
    })
  ) {
    return { ok: true };
  }
  const preview =
    typeof result.data === "object"
    && result.data
    && "preview" in result.data
      ? String((result.data as { preview?: unknown }).preview ?? "")
      : result.summary ?? "";
  return { ok: false, kind: "checkpoint", checkpoint: buildOutlineCheckpoint(preview), updateFocus: true };
};

/** 后置门禁链（工具执行后，按序短路） */
export const POST_GATES: PostToolGate[] = [
  antispamProgressGate,
  clarifyCheckpointGate,
  outlineApproveGate,
];

export function evaluatePostGates(input: PostGateInput): PostToolVerdict {
  for (const gate of POST_GATES) {
    const verdict = gate(input);
    if (!verdict.ok) return verdict;
  }
  return { ok: true };
}
