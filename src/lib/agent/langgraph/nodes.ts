import type { AgentSSEEvent } from "@/contracts/agent";
import { buildAgentSystemPrompt } from "@/lib/agent/core/prompts";
import { createPlan } from "@/lib/agent/core/planner";
import { callAINonStreamingWithTools } from "@/lib/agent/core/llm-tools";
import {
  checkRepeatCall,
  shouldRequestConfirmation,
} from "@/lib/agent/core/safety";
import { checkAgentToolPhaseGate } from "@/lib/agent/core/phase-gates";
import {
  findTool,
  parseToolArgs,
  toolsToOpenAISchema,
} from "@/lib/agent/core/tool-registry";
import { getAgentGraphRuntime } from "@/lib/agent/langgraph/runtime";
import type { AgentGraphStateType } from "@/lib/agent/langgraph/state";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";

function parseUserConfirmed(params: Record<string, unknown>): boolean {
  const raw = params.userConfirmed;
  return raw === true || raw === "true" || raw === 1 || raw === "1";
}

export async function planNode(
  state: AgentGraphStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
  const { agentContext } = getAgentGraphRuntime(config.configurable);
  const events: AgentSSEEvent[] = [{ type: "agent/status", status: "planning" }];

  if (agentContext.signal.aborted) {
    return {
      events: [...events, { type: "agent/status", status: "cancelled" }],
      finished: true,
    };
  }

  try {
    // 续跑：已有 plan 则跳过重新规划
    if (state.plan && state.messages.length > 0) {
      events.push({ type: "agent/status", status: "thinking" });
      return { events };
    }

    const plan = await createPlan(state.goal, agentContext, agentContext.projectBriefing);
    events.push({ type: "agent/plan", plan });
    return {
      plan,
      events,
      messages: [
        {
          role: "assistant",
          content: `Plan:\n${plan.subtasks.map((s, i) => `${i + 1}. ${s.title}`).join("\n")}`,
        },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "规划失败";
    return {
      error: message,
      events: [...events, { type: "agent/error", error: message }],
      finished: true,
    };
  }
}

export async function agentNode(
  state: AgentGraphStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
  if (state.error || state.finished) {
    return {};
  }

  const runtime = getAgentGraphRuntime(config.configurable);
  const { agentContext, tools } = runtime;
  const events: AgentSSEEvent[] = [];

  if (agentContext.signal.aborted) {
    return {
      events: [{ type: "agent/status", status: "cancelled" }],
      finished: true,
    };
  }

  const nextIteration = state.iteration + 1;
  agentContext.budget.currentIteration = nextIteration;

  if (nextIteration > agentContext.budget.maxIterations) {
    return { iteration: nextIteration, finished: true, events };
  }

  events.push({ type: "agent/status", status: "thinking" });

  const systemPrompt = buildAgentSystemPrompt(tools, agentContext.projectBriefing);
  const llmMessages = [{ role: "system" as const, content: systemPrompt }, ...state.messages];

  let response;
  try {
    response = await callAINonStreamingWithTools({
      messages: llmMessages,
      tools: toolsToOpenAISchema(tools),
      signal: agentContext.signal,
      userId: agentContext.userId,
      temperature: 0.3,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "LLM 调用失败";
    return {
      iteration: nextIteration,
      error: message,
      events: [...events, { type: "agent/error", error: message }],
      finished: true,
      messages: [{ role: "user", content: `[System error] ${message}` }],
    };
  }

  const updates: Partial<AgentGraphStateType> = {
    iteration: nextIteration,
    events,
  };

  if (response.content) {
    updates.finalThought = response.content;
    updates.messages = [{ role: "assistant", content: response.content }];
    events.push({ type: "agent/thought", content: response.content });
  }

  if (response.finishReason === "stop" || response.toolCalls.length === 0) {
    updates.finished = true;
    updates.pendingToolCalls = [];
    return updates;
  }

  updates.pendingToolCalls = response.toolCalls;
  return updates;
}

export async function toolsNode(
  state: AgentGraphStateType,
  config: LangGraphRunnableConfig,
): Promise<Partial<AgentGraphStateType>> {
  if (state.error || state.finished || state.pendingToolCalls.length === 0) {
    return { pendingToolCalls: [] };
  }

  const runtime = getAgentGraphRuntime(config.configurable);
  const { agentContext, tools, repeatTracker } = runtime;
  const events: AgentSSEEvent[] = [{ type: "agent/status", status: "executing" }];
  const newMessages: AgentGraphStateType["messages"] = [];
  const newSummaries: string[] = [];
  let toolCallCount = state.toolCallCount;
  let error: string | null = null;
  let finished = false;

  for (const toolCall of state.pendingToolCalls) {
    if (agentContext.budget.toolCallCount >= agentContext.budget.maxToolCalls) {
      error = `单次任务最多调用 ${agentContext.budget.maxToolCalls} 次工具`;
      events.push({ type: "agent/error", error });
      finished = true;
      break;
    }

    const tool = findTool(tools, toolCall.name);
    if (!tool) {
      const msg = `未知工具: ${toolCall.name}`;
      newSummaries.push(`[${toolCall.name}] 失败: ${msg}`);
      newMessages.push({ role: "user", content: `Tool result (${toolCall.name}):\n${msg}` });
      continue;
    }

    const params = parseToolArgs(toolCall.args);
    const repeat = checkRepeatCall(repeatTracker, tool.name, params);
    if (!repeat.allowed) {
      error = repeat.warning ?? "重复调用";
      events.push({ type: "agent/error", error });
      finished = true;
      break;
    }

    events.push({ type: "agent/action", tool: tool.name, params });

    const gate = checkAgentToolPhaseGate(
      tool.name,
      params,
      agentContext.projectSnapshot,
    );
    if (!gate.ok) {
      newSummaries.push(`[${tool.name}] 失败: ${gate.error}`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n${gate.error}`,
      });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result: { success: false, error: gate.error },
        error: gate.error,
      });
      continue;
    }

    if (shouldRequestConfirmation(tool) && !parseUserConfirmed(params)) {
      events.push({
        type: "agent/confirm",
        tool: tool.name,
        params,
        message: `Agent 请求执行 ${tool.name}，请在回复中确认后重试（import_reference 请设 userConfirmed=true）`,
      });
      newSummaries.push(`[${tool.name}] 失败: 写操作需用户确认`);
      newMessages.push({
        role: "user",
        content: `Tool result (${tool.name}):\n写操作需用户确认`,
      });
      continue;
    }

    agentContext.budget.toolCallCount += 1;
    toolCallCount += 1;

    try {
      const result = await tool.execute(params, agentContext);
      const line = result.success
        ? `[${tool.name}] ${result.summary ?? "完成"}`
        : `[${tool.name}] 失败: ${result.error ?? "未知错误"}`;
      newSummaries.push(line);
      newMessages.push({ role: "user", content: `Tool result (${tool.name}):\n${line}` });
      events.push({
        type: "agent/observation",
        tool: tool.name,
        result,
        error: result.success ? undefined : result.error,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      newSummaries.push(`[${tool.name}] 失败: ${errMsg}`);
      newMessages.push({ role: "user", content: `Tool result (${tool.name}):\n${errMsg}` });
      events.push({ type: "agent/observation", tool: tool.name, error: errMsg });
    }
  }

  return {
    pendingToolCalls: [],
    toolCallCount,
    toolSummaries: newSummaries,
    messages: newMessages,
    events,
    error,
    finished: finished || undefined,
  };
}

export async function finalizeNode(
  state: AgentGraphStateType,
): Promise<Partial<AgentGraphStateType>> {
  if (state.events.some((e) => e.type === "agent/status" && e.status === "cancelled")) {
    return { finished: true };
  }

  if (state.error && state.events.some((e) => e.type === "agent/error")) {
    return { finished: true };
  }

  const parts = [
    state.finalThought?.trim(),
    state.toolSummaries.length > 0
      ? `执行摘要:\n${state.toolSummaries.join("\n")}`
      : null,
  ].filter(Boolean);

  const events: AgentSSEEvent[] = [
    { type: "agent/status", status: "finalizing" },
    {
      type: "agent/complete",
      summary: {
        text: parts.join("\n\n") || "任务已完成。",
        toolCallCount: state.toolSummaries.length,
        keyFindings: [],
      },
    },
    { type: "agent/status", status: "completed" },
  ];

  return { events, finished: true };
}
