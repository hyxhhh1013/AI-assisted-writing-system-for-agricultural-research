/**
 * Agent 工具唯一挂载表（W3-AP-ARCH-01）。
 *
 * 加能力：新建 tools/<name>.ts，把导出的 ToolDefinition 推进 READ_TOOLS 或 WRITE_TOOLS。
 * 不要在 agent-loop.ts 里再堆 import。
 * 不要运行时扫磁盘（standalone / Turbopack 会漏文件）。
 *
 * `build-argument-blueprint.ts` 已弃用，故意不挂表；单测里有 UNREGISTERED 名单。
 */

import type { ToolDefinition } from "@/lib/agent/types";
import { analyzeDirectionTool } from "@/lib/agent/tools/analyze-direction";
import { applyRevisionItemTool } from "@/lib/agent/tools/apply-revision-item";
import { askUserTool } from "@/lib/agent/tools/ask-user";
import { checkConsistencyTool } from "@/lib/agent/tools/check-consistency";
import { checkPlagiarismTool } from "@/lib/agent/tools/check-plagiarism";
import { draftMechanismFigureTool } from "@/lib/agent/tools/draft-mechanism-figure";
import { exportManuscriptMarkdownTool } from "@/lib/agent/tools/export-manuscript-markdown";
import { generateChartTool } from "@/lib/agent/tools/generate-chart";
import { generateOutlineTool } from "@/lib/agent/tools/generate-outline";
import { generateTableTool } from "@/lib/agent/tools/generate-table";
import { generateWritingBlueprintTool } from "@/lib/agent/tools/generate-writing-blueprint";
import { generateXrdAnalysisTool } from "@/lib/agent/tools/generate-xrd-analysis";
import { getFullTextTool } from "@/lib/agent/tools/get-full-text";
import { importReferenceTool } from "@/lib/agent/tools/import-reference";
import { ingestProjectDataTool } from "@/lib/agent/tools/ingest-project-data";
import { inspectProjectTool } from "@/lib/agent/tools/inspect-project";
import { listAttachmentsTool } from "@/lib/agent/tools/list-attachments";
import { listPlotSourcesTool } from "@/lib/agent/tools/list-plot-sources";
import { listReferencesTool } from "@/lib/agent/tools/list-references";
import { openBlueprintWorkspaceTool } from "@/lib/agent/tools/open-blueprint-workspace";
import { parseRevisionCommentsTool } from "@/lib/agent/tools/parse-revision-comments";
import { readAttachmentTool } from "@/lib/agent/tools/read-attachment";
import { readFigureTool } from "@/lib/agent/tools/read-figure";
import { readProjectAssetTool } from "@/lib/agent/tools/read-project-asset";
import { readReferenceTool } from "@/lib/agent/tools/read-reference";
import { readSectionTool } from "@/lib/agent/tools/read-section";
import { recallRecentWorkTool } from "@/lib/agent/tools/recall-recent-work";
import { refineContentTool } from "@/lib/agent/tools/refine-content";
import { removeFigureTool } from "@/lib/agent/tools/remove-figure";
import { removeReferencesTool } from "@/lib/agent/tools/remove-references";
import { reviewContentTool } from "@/lib/agent/tools/review-content";
import { rewritePlagiarismTool } from "@/lib/agent/tools/rewrite-plagiarism";
import { runReviewRoundsTool } from "@/lib/agent/tools/run-review-rounds";
import { saveReferenceClassificationTool } from "@/lib/agent/tools/save-reference-classification";
import { searchExternalTool } from "@/lib/agent/tools/search-external";
import { searchKnowledgeTool } from "@/lib/agent/tools/search-knowledge";
import { updatePaperConfigTool } from "@/lib/agent/tools/update-paper-config";
import { updateWorkMemoryTool } from "@/lib/agent/tools/update-work-memory";
import { validateCitationsTool } from "@/lib/agent/tools/validate-citations";
import { verifyContentTool } from "@/lib/agent/tools/verify-content";
import { writeBilingualAbstractTool } from "@/lib/agent/tools/write-bilingual-abstract";
import { writeSectionTool } from "@/lib/agent/tools/write-section";

/** 始终挂给模型（只读 / 核查类） */
export const READ_TOOLS: readonly ToolDefinition[] = [
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

/** 仅 AGENT_WRITE_ENABLED=1 时挂载 */
export const WRITE_TOOLS: readonly ToolDefinition[] = [
  updatePaperConfigTool,
  generateOutlineTool,
  generateWritingBlueprintTool,
  writeSectionTool,
  refineContentTool,
  applyRevisionItemTool,
  importReferenceTool,
  ingestProjectDataTool,
  generateChartTool,
  generateXrdAnalysisTool,
  generateTableTool,
  draftMechanismFigureTool,
  removeFigureTool,
  writeBilingualAbstractTool,
  saveReferenceClassificationTool,
  removeReferencesTool,
];

/** 目录里有文件、故意不给模型看 */
export const UNREGISTERED_TOOL_FILES = ["build-argument-blueprint.ts"] as const;
