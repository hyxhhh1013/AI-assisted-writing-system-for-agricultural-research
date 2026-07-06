import type { AgentSSEEvent } from "@/contracts/agent";
import { callAINonStreamingWithTools } from "@/lib/agent/core/llm-tools";
import { createMemory } from "@/lib/agent/core/memory";
import { createPlan } from "@/lib/agent/core/planner";
import {
  checkRepeatCall,
  COST_LIMITS,
  createRepeatTracker,
  shouldRequestConfirmation,
} from "@/lib/agent/core/safety";
import {
  findTool,
  parseToolArgs,
  toolsDescriptionText,
  toolsToOpenAISchema,
} from "@/lib/agent/core/tool-registry";
import { analyzeDirectionTool } from "@/lib/agent/tools/analyze-direction";
import { getFullTextTool } from "@/lib/agent/tools/get-full-text";
import { reviewContentTool } from "@/lib/agent/tools/review-content";
import { searchExternalTool } from "@/lib/agent/tools/search-external";
import { searchKnowledgeTool } from "@/lib/agent/tools/search-knowledge";
import { validateCitationsTool } from "@/lib/agent/tools/validate-citations";
import { verifyContentTool } from "@/lib/agent/tools/verify-content";
import type { AgentContext, AgentLoopOptions, ToolDefinition } from "@/lib/agent/types";

function buildSystemPrompt(tools: ToolDefinition[]): string {
  return `你是禾书耕文（GrainScript）科研写作 Agent，专注农业与碳材料领域。

职责：
1. 根据用户目标选择合适的工具收集信息、验证内容
2. 每次只调用完成当前步骤所需的工具
3. 工具执行后综合结果，用中文给出清晰、可操作的结论
4. Phase A 限制：你只能使用只读工具，不能撰写或修改论文章节

引用规则：结论需标注信息来源；不可编造文献或数据。

可用工具：
${toolsDescriptionText(tools)}`;
}

export async function* runAgentLoop(
  options: AgentLoopOptions,
): AsyncGenerator<AgentSSEEvent> {
  const { goal, context, tools } = options;
  const memory = createMemory(goal, tools);
  const repeatTracker = createRepeatTracker();
  const toolSchemas = toolsToOpenAISchema(tools);

  yield { type: "agent/status", status: "planning" };

  try {
    const plan = await createPlan(goal, context);
    memory.recordPlan(plan);
    yield { type: "agent/plan", plan };
  } catch (error) {
    yield {
      type: "agent/error",
      error: error instanceof Error ? error.message : "规划失败",
    };
    return;
  }

  let finalThought: string | null = null;

  while (memory.iteration < context.budget.maxIterations) {
    memory.iteration = memory.iteration + 1;
    context.budget.currentIteration = memory.iteration;

    if (context.signal.aborted) {
      yield { type: "agent/status", status: "cancelled" };
      return;
    }

    yield { type: "agent/status", status: "thinking" };

    let response;
    try {
      response = await callAINonStreamingWithTools({
        messages: memory.buildMessages(buildSystemPrompt(tools)),
        tools: toolSchemas,
        signal: context.signal,
        userId: context.userId,
        temperature: 0.3,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "LLM 调用失败";
      memory.recordError(msg);
      yield { type: "agent/error", error: msg };
      return;
    }

    if (response.content) {
      memory.recordThought(response.content);
      yield { type: "agent/thought", content: response.content };
      finalThought = response.content;
    }

    if (response.finishReason === "stop" || response.toolCalls.length === 0) {
      break;
    }

    yield { type: "agent/status", status: "executing" };

    for (const toolCall of response.toolCalls) {
      if (context.budget.toolCallCount >= context.budget.maxToolCalls) {
        memory.recordError("已达工具调用上限");
        yield {
          type: "agent/error",
          error: `单次任务最多调用 ${context.budget.maxToolCalls} 次工具`,
        };
        return;
      }

      const tool = findTool(tools, toolCall.name);
      if (!tool) {
        memory.recordError(`未知工具: ${toolCall.name}`);
        continue;
      }

      const params = parseToolArgs(toolCall.args);
      const repeat = checkRepeatCall(repeatTracker, tool.name, params);
      if (!repeat.allowed) {
        memory.recordError(repeat.warning ?? "重复调用");
        yield { type: "agent/error", error: repeat.warning ?? "重复调用" };
        return;
      }

      yield { type: "agent/action", tool: tool.name, params };

      if (shouldRequestConfirmation(tool)) {
        yield {
          type: "agent/confirm",
          tool: tool.name,
          params,
          message: `Agent 请求执行 ${tool.name}，需用户确认（Phase A 只读工具不应触发）`,
        };
        memory.recordError("写操作需确认，Phase A 未实现确认流");
        continue;
      }

      context.budget.toolCallCount += 1;

      try {
        const result = await tool.execute(params, context);
        memory.recordObservation(tool.name, result);
        yield {
          type: "agent/observation",
          tool: tool.name,
          result,
          error: result.success ? undefined : result.error,
        };
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        memory.recordObservation(tool.name, { success: false, error: errMsg });
        yield { type: "agent/observation", tool: tool.name, error: errMsg };
      }
    }
  }

  yield { type: "agent/status", status: "finalizing" };
  const summaryBody = memory.buildSummary(finalThought);
  yield {
    type: "agent/complete",
    summary: {
      text: summaryBody.text,
      toolCallCount: summaryBody.toolCallCount,
      keyFindings: summaryBody.keyFindings,
    },
  };
  yield { type: "agent/status", status: "completed" };
}

export function createAgentContext(params: {
  userId: string;
  projectId?: string;
  directionSlug?: string;
  signal: AbortSignal;
}): AgentContext {
  return {
    userId: params.userId,
    projectId: params.projectId,
    directionSlug: params.directionSlug,
    signal: params.signal,
    budget: {
      maxIterations: COST_LIMITS.maxIterations,
      currentIteration: 0,
      maxToolCalls: COST_LIMITS.maxToolCallsPerTask,
      toolCallCount: 0,
    },
  };
}

export function createReadOnlyTools(): ToolDefinition[] {
  return [
    searchKnowledgeTool,
    searchExternalTool,
    getFullTextTool,
    validateCitationsTool,
    verifyContentTool,
    reviewContentTool,
    analyzeDirectionTool,
  ];
}
