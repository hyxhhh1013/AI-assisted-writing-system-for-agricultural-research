import type { AgentSSEEvent } from "@/contracts/agent";
import {
  COST_LIMITS,
  isAgentWriteEnabled,
} from "@/lib/agent/core/safety";
import { runAgentGraphLoop } from "@/lib/agent/langgraph/run-graph";
import { analyzeDirectionTool } from "@/lib/agent/tools/analyze-direction";
import { checkPlagiarismTool } from "@/lib/agent/tools/check-plagiarism";
import { checkConsistencyTool } from "@/lib/agent/tools/check-consistency";
import { rewritePlagiarismTool } from "@/lib/agent/tools/rewrite-plagiarism";
import { generateTableTool } from "@/lib/agent/tools/generate-table";
import { generateChartTool } from "@/lib/agent/tools/generate-chart";
import { generateXrdAnalysisTool } from "@/lib/agent/tools/generate-xrd-analysis";
import { draftMechanismFigureTool } from "@/lib/agent/tools/draft-mechanism-figure";
import { getFullTextTool } from "@/lib/agent/tools/get-full-text";
import { askUserTool } from "@/lib/agent/tools/ask-user";
import { importReferenceTool } from "@/lib/agent/tools/import-reference";
import { listPlotSourcesTool } from "@/lib/agent/tools/list-plot-sources";
import { readFigureTool } from "@/lib/agent/tools/read-figure";
import { listReferencesTool } from "@/lib/agent/tools/list-references";
import { readReferenceTool } from "@/lib/agent/tools/read-reference";
import { parseRevisionCommentsTool } from "@/lib/agent/tools/parse-revision-comments";
import { applyRevisionItemTool } from "@/lib/agent/tools/apply-revision-item";
import { exportManuscriptMarkdownTool } from "@/lib/agent/tools/export-manuscript-markdown";
import { recallRecentWorkTool } from "@/lib/agent/tools/recall-recent-work";
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
import { generateOutlineTool } from "@/lib/agent/tools/generate-outline";
import { generateWritingBlueprintTool } from "@/lib/agent/tools/generate-writing-blueprint";
import { inspectProjectTool } from "@/lib/agent/tools/inspect-project";
import { readAttachmentTool } from "@/lib/agent/tools/read-attachment";
import { listAttachmentsTool } from "@/lib/agent/tools/list-attachments";
import { readProjectAssetTool } from "@/lib/agent/tools/read-project-asset";
import { readSectionTool } from "@/lib/agent/tools/read-section";
import { updatePaperConfigTool } from "@/lib/agent/tools/update-paper-config";
import { updateWorkMemoryTool } from "@/lib/agent/tools/update-work-memory";
import { openBlueprintWorkspaceTool } from "@/lib/agent/tools/open-blueprint-workspace";
import { saveReferenceClassificationTool } from "@/lib/agent/tools/save-reference-classification";
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
  return [
    askUserTool,
    readAttachmentTool,
    listAttachmentsTool,
    inspectProjectTool,
    recallRecentWorkTool,
    updateWorkMemoryTool,
    readProjectAssetTool,
    openBlueprintWorkspaceTool,
    readSectionTool,
    listReferencesTool,
    readReferenceTool,
    listPlotSourcesTool,
    readFigureTool,
    searchKnowledgeTool,
    searchExternalTool,
    getFullTextTool,
    validateCitationsTool,
    verifyContentTool,
    reviewContentTool,
    analyzeDirectionTool,
    checkPlagiarismTool,
    rewritePlagiarismTool,
    checkConsistencyTool,
    runReviewRoundsTool,
    parseRevisionCommentsTool,
    exportManuscriptMarkdownTool,
  ];
}

/** 只读 + 可选写工具（AGENT_WRITE_ENABLED=1） */
export function createAgentTools(): ToolDefinition[] {
  const tools = createReadOnlyTools();
  if (isAgentWriteEnabled()) {
    tools.push(
      updatePaperConfigTool,
      generateOutlineTool,
      generateWritingBlueprintTool,
      writeSectionTool,
      refineContentTool,
      applyRevisionItemTool,
      importReferenceTool,
      generateChartTool,
      generateXrdAnalysisTool,
      generateTableTool,
      draftMechanismFigureTool,
      buildArgumentBlueprintTool,
      writeBilingualAbstractTool,
      saveReferenceClassificationTool,
    );
  }
  return tools;
}
