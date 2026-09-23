/**
 * 一轮里已经落地的可见结果。计划续跑看到它就停，等用户决定下一步。
 * 自查/阅读类观察往回跳过，避免「写完再 validate」被当成还能接着写下一节。
 */

const PASS_THROUGH_TOOLS = new Set([
  "validate_citations",
  "verify_content",
  "review_content",
  "run_review_rounds",
  "check_consistency",
  "check_plagiarism",
  "read_section",
  "read_reference",
  "read_project_asset",
  "read_attachment",
  "read_figure",
  "read_full_text",
  "list_references",
  "list_plot_sources",
  "list_attachments",
  "inspect_project",
  "recall_recent_work",
  "get_full_text",
]);

const VISIBLE_DELIVERABLE_TOOLS = new Set([
  "write_section",
  "refine_content",
  "write_bilingual_abstract",
  "generate_outline",
  "generate_writing_blueprint",
  "generate_chart",
  "draft_mechanism_figure",
  "generate_xrd_analysis",
  "generate_table",
  "import_reference",
  "ingest_project_data",
  "apply_revision_item",
  "update_paper_config",
]);

export function latestActionIsVisibleDeliverable(
  observations: readonly { tool: string; success: boolean }[],
): boolean {
  for (let i = observations.length - 1; i >= 0; i--) {
    const obs = observations[i];
    if (!obs?.success) continue;
    if (PASS_THROUGH_TOOLS.has(obs.tool)) continue;
    return VISIBLE_DELIVERABLE_TOOLS.has(obs.tool);
  }
  return false;
}
