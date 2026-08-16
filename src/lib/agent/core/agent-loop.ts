import type { AgentSSEEvent } from "@/contracts/agent";
import {
  COST_LIMITS,
  isAgentWriteEnabled,
} from "@/lib/agent/core/safety";
import { registerTools } from "@/lib/agent/core/tool-registry";
import { runAgentGraphLoop } from "@/lib/agent/langgraph/run-graph";
import { READ_TOOLS, WRITE_TOOLS } from "@/lib/agent/tools/registry";
import type { AgentContext, AgentLoopOptions, ToolDefinition } from "@/lib/agent/types";

/** LangGraph ReAct 编排（W2-LANGGRAPH） */
export async function* runAgentLoop(
  options: AgentLoopOptions,
): AsyncGenerator<AgentSSEEvent> {
  yield* runAgentGraphLoop(options);
}

export function createAgentContext(params: {
  userId: string;
  sessionId?: string;
  projectId?: string;
  directionSlug?: string;
  signal: AbortSignal;
}): AgentContext {
  return {
    userId: params.userId,
    sessionId: params.sessionId,
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
  return registerTools([...READ_TOOLS]);
}

/** 只读 + 可选写工具（AGENT_WRITE_ENABLED=1）。挂载表见 tools/registry.ts */
export function createAgentTools(): ToolDefinition[] {
  if (!isAgentWriteEnabled()) return createReadOnlyTools();
  return registerTools([...READ_TOOLS, ...WRITE_TOOLS]);
}
