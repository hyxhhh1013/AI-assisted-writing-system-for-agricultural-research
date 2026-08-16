/**
 * 只读工具并行快路径。
 *
 * 背景：toolsNode 原实现串行 await 每个工具调用；文献检索/多读路径（连读多篇、
 * 多轮换 query 搜索、读章节+列表）大量互相独立的只读调用被白白排队。
 *
 * 策略：
 * - 仅当 pendingToolCalls 全部命中 PARALLEL_READ_TOOLS 白名单（纯读、无确认、
 *   无 checkpoint 副作用）时才走快路径；混入写/确认/检查点工具时由 toolsNode
 *   原串行循环处理，快路径对其零影响。
 * - 门禁与串行路径同源：evaluatePreGates + evaluatePhaseGate（含摘要/审查/分类意图），
 *   门禁用「增量累计观察」模拟串行路径（接纳批次时按 success:true 合成观察）；
 *   执行用 Promise.all；结果按原顺序产出，保证 SSE 事件与 observations 顺序稳定。
 * - agent/action→agent/observation 按批次成组发出（A,A,O,O）而非逐个交织；未知工具分支
 *   在图中不可达（allParallelSafe 不通过时由 toolsNode 串行处理）。
 * - 停滞熔断（noteToolProgress 的 stagnant）对并行批不生效：批内调用已全部执行，
 *   无法事后熔断；全只读批的合法读取应被放行，串行路径的熔断仍对混入写入的批次生效。
 */

import type { AgentSSEEvent } from "@/contracts/agent";
import { noteSearchCall, noteToolProgress } from "@/lib/agent/core/antispam";
import { findTool, parseToolArgs } from "@/lib/agent/core/tool-registry";
import { advancePlanAfterTool } from "@/lib/agent/core/plan-progress";
import { formatToolObservationForLlm } from "@/lib/agent/observation-memory";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { AgentToolTrace } from "@/contracts/agent-session";
import type { AgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import {
  evaluatePhaseGate,
  evaluatePreGates,
  type PreGateInput,
} from "@/lib/agent/langgraph/tool-gates";
import type {
  LLMMessage,
  ParsedToolCall,
  ToolDefinition,
  ToolObservation,
} from "@/lib/agent/types";
import {
  buildFigureQaContinueNudge,
  collectFigureQaFailures,
} from "@/lib/agent/figure-loop";

/** 纯读、无确认、无 checkpoint/记忆副作用、可乱序并行的工具白名单 */
export const PARALLEL_READ_TOOLS = new Set([
  "inspect_project",
  "list_references",
  "read_reference",
  "read_section",
  "read_project_asset",
  "read_attachment",
  "list_attachments",
  "list_plot_sources",
  "read_figure",
  "read_full_text",
  "search_knowledge",
  "search_external",
]);

/** 全部调用都可安全并行时才走快路径 */
export function allParallelSafe(
  pending: ParsedToolCall[],
  tools: ToolDefinition[],
): boolean {
  if (pending.length < 2) return false;
  return pending.every((tc) => {
    const tool = findTool(tools, tc.name);
    return (
      tool !== undefined
      && PARALLEL_READ_TOOLS.has(tool.name)
      && !tool.requiresConfirmation
    );
  });
}

/** 并行执行全部只读调用，返回与串行路径同构的 state 更新 */
export async function runParallelReads(
  state: AgentGraphStateType,
  runtime: AgentGraphRuntime,
): Promise<Partial<AgentGraphStateType>> {
  const { agentContext, tools, repeatTracker, antispamTracker } = runtime;
  const events: AgentSSEEvent[] = [{ type: "agent/status", status: "executing" }];
  const newMessages: LLMMessage[] = [];
  const newSummaries: string[] = [];
  const newObservations: ToolObservation[] = [];
  const newTrace: AgentToolTrace[] = [];
  const trace = (toolName: string, ok: boolean) => {
    newTrace.push({
      at: Date.now(),
      tool: toolName,
      ok,
      intentKind: state.intentKind ?? null,
    });
  };
  let toolCallCount = state.toolCallCount;
  let error: string | null = null;
  let plan = state.plan;

  const rejectGate = (toolName: string, err: string) => {
    trace(toolName, false);
    newSummaries.push(`[${toolName}] 失败: ${err}`);
    newMessages.push({
      role: "user",
      content: `Tool result (${toolName}):\n${err}`,
    });
    events.push({
      type: "agent/observation",
      tool: toolName,
      result: { success: false, error: err },
      error: err,
    });
    plan = advancePlanAfterTool(plan, toolName, false);
  };

  // 门禁基于「增量累计观察」判定：随批次接纳逐步 push 合成观察，模拟串行路径。
  // 串行在评估 list_references 前已记录 inspect_project 的 observation；并行无法预知
  // 执行结果，故接纳时按 success:true 推进——对诊断 inspect 门禁/引用读上限等只读相关门禁等价。
  const effectiveObs = [...state.observations];
  const batch: Array<{
    tool: ToolDefinition;
    params: Record<string, unknown>;
  }> = [];

  for (const toolCall of state.pendingToolCalls) {
    if (
      agentContext.budget.toolCallCount + batch.length
      >= agentContext.budget.maxToolCalls
    ) {
      error = `单次任务最多调用 ${agentContext.budget.maxToolCalls} 次工具`;
      events.push({ type: "agent/error", error });
      break;
    }

    const tool = findTool(tools, toolCall.name);
    if (!tool) {
      rejectGate(toolCall.name, `未知工具: ${toolCall.name}`);
      continue;
    }
    const params = parseToolArgs(toolCall.args);

    const gateInput: PreGateInput = {
      tool,
      params,
      state,
      agentContext,
      repeatTracker,
      antispamTracker,
      recentObservations: effectiveObs,
    };
    const gateVerdict = evaluatePreGates(gateInput);
    if (!gateVerdict.ok) {
      if (gateVerdict.kind === "hard") {
        trace(tool.name, false);
        error = gateVerdict.error;
        events.push({ type: "agent/error", error });
        break;
      }
      if (gateVerdict.kind === "soft") {
        trace(tool.name, false);
        newSummaries.push(`[${tool.name}] ${gateVerdict.error}`);
        newMessages.push({
          role: "user",
          content: `Tool result (${tool.name}):\n${gateVerdict.error}`,
        });
        events.push({
          type: "agent/observation",
          tool: tool.name,
          result: { success: false, error: gateVerdict.error },
          error: gateVerdict.error,
        });
        continue;
      }
      rejectGate(tool.name, gateVerdict.error);
      continue;
    }

    const phaseVerdict = evaluatePhaseGate(gateInput);
    if (!phaseVerdict.ok) {
      rejectGate(tool.name, phaseVerdict.error);
      continue;
    }

    // 通过全部门禁：先发 action 事件（与串行路径顺序一致），入批执行
    events.push({ type: "agent/action", tool: tool.name, params });
    batch.push({ tool, params });
    // 合成观察：让后续调用的门禁看到「本工具已在批内执行」（串行等价）
    effectiveObs.push({ tool: tool.name, success: true, data: undefined });
    // 搜索配额随接纳即时计数：让批内后续搜索看到已接纳数量（串行等价，防批内超发）
    if (tool.name === "search_external" || tool.name === "search_knowledge") {
      noteSearchCall(antispamTracker, tool.name);
    }
  }

  // 并行执行：只读互不依赖；单点失败捕获为 success:false，不中断其它调用
  const results = await Promise.all(
    batch.map(async ({ tool, params }) => {
      agentContext.budget.toolCallCount += 1;
      try {
        return { tool, params, result: await tool.execute(params, agentContext) };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          tool,
          params,
          result: { success: false as const, error: msg },
        };
      }
    }),
  );

  // 按原顺序记录结果
  for (const { tool, result } of results) {
    toolCallCount += 1;
    trace(tool.name, result.success);
    const line = result.success
      ? `[${tool.name}] ${result.summary ?? "完成"}`
      : `[${tool.name}] 失败: ${result.error ?? "未知错误"}`;
    newSummaries.push(line);
    newMessages.push({
      role: "user",
      content: formatToolObservationForLlm(tool.name, result),
    });
    events.push({
      type: "agent/observation",
      tool: tool.name,
      result,
      error: result.success ? undefined : result.error,
    });
    newObservations.push({
      tool: tool.name,
      success: result.success,
      error: result.error,
      data: result.data,
    });
    plan = advancePlanAfterTool(plan, tool.name, result.success);
    noteToolProgress(
      antispamTracker,
      tool.name,
      agentContext.projectSnapshot,
      result.success,
    );
  }

  // 并行 read_figure(qa) 未走串行 figure-loop：在此补硬 nudge，避免模型空口收尾
  const qaFails = collectFigureQaFailures(newObservations);
  for (const imageUrl of qaFails) {
    newSummaries.push(`[figure-loop] QA 未通过：下一轮必须 replaceImageUrl=${imageUrl}`);
    newMessages.push({
      role: "user",
      content: buildFigureQaContinueNudge(imageUrl),
    });
  }

  if (plan) {
    events.push({ type: "agent/plan", plan });
  }

  return {
    pendingToolCalls: [],
    toolCallCount,
    toolSummaries: newSummaries,
    observations: newObservations,
    messages: newMessages,
    events,
    error,
    toolTrace: newTrace,
    ...(error ? { finished: true } : {}),
    plan,
  };
}
