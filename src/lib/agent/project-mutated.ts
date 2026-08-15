/** 从 Agent 工具 observation 判断「项目数据已变更，工作台需刷新」 */

export const PROJECT_MUTATING_TOOLS = [
  "update_paper_config",
  "generate_outline",
  "generate_writing_blueprint",
  "build_argument_blueprint",
  "write_section",
  "refine_content",
  "apply_revision_item",
  "write_bilingual_abstract",
  "import_reference",
  "ingest_project_data",
  "validate_citations",
  "run_review_rounds",
  "generate_chart",
  "generate_xrd_analysis",
  "generate_table",
  "draft_mechanism_figure",
  "remove_figure",
  "save_reference_classification",
  "remove_references",
] as const;

export type ProjectMutatingTool = (typeof PROJECT_MUTATING_TOOLS)[number];

export interface AgentProjectMutatedInfo {
  tool: string;
  /** 给人看的短标签 */
  label: string;
  /** 事件时间戳，便于 UI 依赖刷新 */
  at: number;
}

const TOOL_LABELS: Record<string, string> = {
  update_paper_config: "论文配置",
  generate_outline: "大纲",
  generate_writing_blueprint: "写作蓝图",
  build_argument_blueprint: "论证蓝图",
  write_section: "章节正文",
  refine_content: "润色正文",
  apply_revision_item: "审稿修订",
  write_bilingual_abstract: "双语摘要",
  import_reference: "参考文献",
  ingest_project_data: "数据入库",
  validate_citations: "引用检查",
  run_review_rounds: "审查轮次",
  generate_chart: "图表",
  generate_xrd_analysis: "XRD 分析",
  generate_table: "三线表",
  draft_mechanism_figure: "机理图",
  remove_figure: "删除图表",
  save_reference_classification: "文献分类",
  remove_references: "删除文献",
};

export function isProjectMutatingTool(tool: string): tool is ProjectMutatingTool {
  return (PROJECT_MUTATING_TOOLS as readonly string[]).includes(tool);
}

export function extractProjectMutated(
  tool: string,
  result: { success?: boolean; data?: unknown } | undefined,
): AgentProjectMutatedInfo | null {
  if (!result?.success) return null;
  if (!isProjectMutatingTool(tool)) return null;

  // 部分工具允许「预览未写回」
  if (result.data != null && typeof result.data === "object") {
    const data = result.data as Record<string, unknown>;
    if (data.persisted === false || data.persisted === "false") {
      return null;
    }
    // import_reference 预览 / 待确认
    if (
      tool === "import_reference"
      && (data.preview === true || data.requiresConfirmation === true)
    ) {
      return null;
    }
    // 导入成功需明确 persisted
    if (tool === "import_reference" && data.persisted !== true && data.persisted !== "true") {
      return null;
    }
  }

  return {
    tool,
    label: TOOL_LABELS[tool] ?? tool,
    at: Date.now(),
  };
}
