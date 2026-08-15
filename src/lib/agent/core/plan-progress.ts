import type { AgentPlan, AgentSubTask } from "@/contracts/agent";

/** 工具名 → 可推进的计划关键词（标题或 toolHints） */
const TOOL_TITLE_HINTS: Record<string, string[]> = {
  search_knowledge: ["检索", "文献", "知识库", "search"],
  search_external: ["外部", "检索", "文献", "search"],
  import_reference: ["导入", "参考文献", "import"],
  generate_outline: ["大纲", "outline", "结构", "架构", "提纲"],
  generate_writing_blueprint: ["写作蓝图", "writing_blueprint", "蓝图", "词数"],
  build_argument_blueprint: ["论证", "argument", "主张"],
  write_section: ["写", "起草", "扩写", "write_section", "章节", "引言", "方法", "结果"],
  refine_content: ["修正", "润色", "refine"],
  validate_citations: ["引用", "citation", "validate"],
  write_bilingual_abstract: ["摘要", "abstract", "双语"],
  run_review_rounds: ["审查", "review", "peer"],
  check_plagiarism: ["查重", "plagiarism"],
  review_content: ["审查", "review"],
  verify_content: ["核查", "verify"],
  generate_chart: ["图表", "chart", "配图", "画图", "做图"],
  draft_mechanism_figure: ["机理", "示意图", "流程图", "mechanism", "framework"],
  remove_figure: ["删图", "删除图", "去掉图", "remove figure"],
  read_figure: ["识图", "回看", "看图", "质检图"],
  generate_xrd_analysis: ["XRD", "xrd", "Scherrer", "晶粒", "衍射", "峰表"],
  list_plot_sources: ["图表", "chart", "配图", "数据源"],
  list_references: ["文献", "参考", "reference"],
  read_reference: ["读文献", "摘要", "read_reference", "文献摘要"],
  read_project_asset: ["大纲", "蓝图", "护照", "配置", "outline", "blueprint"],
  update_paper_config: ["配置", "题目", "config"],
  parse_revision_comments: ["审稿", "修订", "意见", "revision", "reviewer"],
  apply_revision_item: ["修订", "按意见", "改稿"],
  export_manuscript_markdown: ["导出", "markdown", "手稿", "打包"],
  recall_recent_work: ["上次", "继续", "记忆", "回顾"],
  analyze_direction: ["方向", "direction"],
  read_full_text: ["全文", "full"],
};

export function getFocusSubtask(plan: AgentPlan | null | undefined): AgentSubTask | null {
  if (!plan?.subtasks.length) return null;
  const running = plan.subtasks.find((s) => s.status === "running");
  if (running) return running;
  return plan.subtasks.find((s) => s.status === "pending") ?? null;
}

export function planHasPendingWork(plan: AgentPlan | null | undefined): boolean {
  if (!plan?.subtasks.length) return false;
  return plan.subtasks.some((s) => s.status === "pending" || s.status === "running");
}

export function countPlanDone(plan: AgentPlan | null | undefined): number {
  if (!plan) return 0;
  return plan.subtasks.filter((s) => s.status === "done" || s.status === "skipped").length;
}

/** 将焦点子任务标为 running，其余 pending 保持 */
export function markFocusRunning(plan: AgentPlan): AgentPlan {
  const focus = getFocusSubtask(plan);
  if (!focus) return plan;
  return {
    subtasks: plan.subtasks.map((s) => {
      if (s.id === focus.id && s.status === "pending") {
        return { ...s, status: "running" as const };
      }
      return s;
    }),
  };
}

function subtaskMatchesTool(subtask: AgentSubTask, toolName: string): boolean {
  const hints = [
    ...(subtask.toolHints ?? []),
    ...((TOOL_TITLE_HINTS[toolName] ?? []) as string[]),
  ];
  const title = subtask.title.toLowerCase();
  if (subtask.toolHints?.includes(toolName)) return true;
  if (title.includes(toolName.toLowerCase())) return true;
  return hints.some((h) => title.includes(h.toLowerCase()));
}

/**
 * 工具成功后推进计划：优先推进「running/pending 且匹配该工具」的最早子任务。
 */
export function advancePlanAfterTool(
  plan: AgentPlan | null | undefined,
  toolName: string,
  success: boolean,
): AgentPlan | null {
  if (!plan?.subtasks.length) return plan ?? null;

  const candidates = plan.subtasks.filter(
    (s) =>
      (s.status === "running" || s.status === "pending")
      && subtaskMatchesTool(s, toolName),
  );
  const target =
    candidates.find((s) => s.status === "running")
    ?? candidates[0]
    ?? null;

  if (!target) {
    // 无匹配：若有 running，成功则仍标 done（宽松推进）；失败保持
    const running = plan.subtasks.find((s) => s.status === "running");
    if (!running || !success) return plan;
    return {
      subtasks: plan.subtasks.map((s) =>
        s.id === running.id ? { ...s, status: "done" as const } : s,
      ),
    };
  }

  if (!success) {
    // 失败：running → pending，允许重试
    return {
      subtasks: plan.subtasks.map((s) =>
        s.id === target.id && s.status === "running"
          ? { ...s, status: "pending" as const }
          : s,
      ),
    };
  }

  const next = plan.subtasks.map((s) => {
    if (s.id === target.id) return { ...s, status: "done" as const };
    return s;
  });

  // 自动点亮下一个 pending 为 running
  const nextPending = next.find((s) => s.status === "pending");
  return {
    subtasks: next.map((s) =>
      nextPending && s.id === nextPending.id
        ? { ...s, status: "running" as const }
        : s,
    ),
  };
}

export function buildContinueNudge(plan: AgentPlan): string {
  const focus = getFocusSubtask(plan);
  const lines = plan.subtasks
    .filter((s) => s.status === "pending" || s.status === "running")
    .map((s) => `- [${s.status}] ${s.title}`);
  return [
    "【系统】计划尚有未完成子任务，请继续调用工具推进；全部完成后可直接回复用户。",
    "若确实需要用户澄清才能继续，请直接说明问题，不要重复调用相同工具。",
    ...lines,
    focus ? `当前应优先：${focus.title}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
