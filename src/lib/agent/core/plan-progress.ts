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
  generate_table: ["三线表", "表格", "table", "ANOVA", "统计表"],
  draft_mechanism_figure: ["机理", "示意图", "流程图", "mechanism", "framework"],
  remove_figure: ["删图", "删除图", "去掉图", "remove figure"],
  read_figure: ["识图", "回看", "看图", "质检图"],
  generate_xrd_analysis: ["XRD", "xrd", "Scherrer", "晶粒", "衍射", "峰表"],
  list_plot_sources: ["图表", "chart", "配图", "数据源"],
  ingest_project_data: ["入库", "数据", "ingest", "上传表格", "csv", "excel"],
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

/** 读/列工具：不得靠标题里的「文献/大纲」把「生成大纲/蓝图」标完成 */
const READ_PLAN_TOOLS = new Set([
  "list_references",
  "read_project_asset",
  "inspect_project",
  "search_knowledge",
  "search_external",
  "read_section",
  "read_reference",
  "list_attachments",
  "list_plot_sources",
  "read_attachment",
]);

/** 读/检索不算「进展」，不能清零续跑计数，否则会检索→空停→再推→再检索直到图递归上限 */
export function shouldResetPlanContinueCount(toolNames: readonly string[]): boolean {
  return toolNames.some((name) => !READ_PLAN_TOOLS.has(name));
}

function subtaskMatchesTool(subtask: AgentSubTask, toolName: string): boolean {
  if (subtask.toolHints && subtask.toolHints.length > 0) {
    return subtask.toolHints.includes(toolName);
  }
  const title = subtask.title.toLowerCase();
  if (title.includes(toolName.toLowerCase())) return true;
  if (READ_PLAN_TOOLS.has(toolName) && /生成|写回|起草|撰写/.test(subtask.title)) {
    return false;
  }
  if (toolName === "generate_outline" && /蓝图|blueprint/.test(subtask.title)) {
    return false;
  }
  const hints = TOOL_TITLE_HINTS[toolName] ?? [];
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
    // 无匹配则保持原状。禁止「任意成功工具把当前 running 勾掉」——
    // 否则 list_references / generate_outline 会误完成「依据大纲生成写作蓝图」。
    return plan;
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

const ANNOUNCED_TOOLS: Array<{ re: RegExp; tool: string; label: string }> = [
  { re: /写作蓝图|generate_writing_blueprint/i, tool: "generate_writing_blueprint", label: "生成写作蓝图" },
  { re: /生成大纲|generate_outline/i, tool: "generate_outline", label: "生成大纲" },
  {
    re: /撰写(?:引言|章节|本节)|写引言(?:并|章节)|write_section|对齐蓝图要点/i,
    tool: "write_section",
    label: "撰写章节",
  },
];

/** 收尾提示里的「先写引言」示例，不能当成口头宣布要 write_section */
export function isPlanLeftoverSpeech(text: string): boolean {
  return /还有未完成步骤|你可以直接说「继续」或指定下一步/.test(text);
}

/** 口头宣布要调用某工具、观察里还没有成功记录 */
export function thoughtAnnouncesUnfinishedTool(
  content: string | null | undefined,
  observations: ReadonlyArray<{ tool: string; success: boolean }>,
): { tool: string; label: string } | null {
  const text = content?.trim() ?? "";
  if (!text || isPlanLeftoverSpeech(text)) return null;
  for (const item of ANNOUNCED_TOOLS) {
    if (!item.re.test(text)) continue;
    if (observations.some((o) => o.tool === item.tool && o.success)) continue;
    return { tool: item.tool, label: item.label };
  }
  return null;
}

export function buildAnnounceToolNudge(announced: { tool: string; label: string }): string {
  return (
    `【系统】你刚说要${announced.label}，但还没有成功调用 ${announced.tool}。`
    + "请立刻调用该工具，不要只口头宣布然后结束。"
  );
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
