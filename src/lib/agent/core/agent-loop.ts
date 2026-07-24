import type { AgentSSEEvent } from "@/contracts/agent";
import {
  COST_LIMITS,
  isAgentWriteEnabled,
} from "@/lib/agent/core/safety";
import { runAgentGraphLoop } from "@/lib/agent/langgraph/run-graph";
import { analyzeDirectionTool } from "@/lib/agent/tools/analyze-direction";
import { checkPlagiarismTool } from "@/lib/agent/tools/check-plagiarism";
import { generateChartTool } from "@/lib/agent/tools/generate-chart";
import { getFullTextTool } from "@/lib/agent/tools/get-full-text";
import { importReferenceTool } from "@/lib/agent/tools/import-reference";
import { refineContentTool } from "@/lib/agent/tools/refine-content";
import { reviewContentTool } from "@/lib/agent/tools/review-content";
import { runReviewRoundsTool } from "@/lib/agent/tools/run-review-rounds";
import { searchExternalTool } from "@/lib/agent/tools/search-external";
import { searchKnowledgeTool } from "@/lib/agent/tools/search-knowledge";
import { validateCitationsTool } from "@/lib/agent/tools/validate-citations";
import { verifyContentTool } from "@/lib/agent/tools/verify-content";
import { writeSectionTool } from "@/lib/agent/tools/write-section";
import { buildArgumentBlueprintTool } from "@/lib/agent/tools/build-argument-blueprint";
import { writeBilingualAbstractTool } from "@/lib/agent/tools/write-bilingual-abstract";
import type { AgentContext, AgentLoopOptions, ToolDefinition } from "@/lib/agent/types";

/** LangGraph ReAct 编排（W2-LANGGRAPH） */
export async function* runAgentLoop(
  options: AgentLoopOptions,
): AsyncGenerator<AgentSSEEvent> {
  yield* runAgentGraphLoop(options);
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
    checkPlagiarismTool,
    runReviewRoundsTool,
  ];
}

/** 只读 + 可选写工具（AGENT_WRITE_ENABLED=1） */
export function createAgentTools(): ToolDefinition[] {
  const tools = createReadOnlyTools();
  if (isAgentWriteEnabled()) {
    tools.push(
      writeSectionTool,
      refineContentTool,
      importReferenceTool,
      generateChartTool,
      buildArgumentBlueprintTool,
      writeBilingualAbstractTool,
    );
  }
  return tools;
}
