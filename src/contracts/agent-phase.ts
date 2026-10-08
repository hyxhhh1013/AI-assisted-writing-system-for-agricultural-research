/**
 * Agent 阶段（W3-AP-PHASE-02/03）。
 * D1：没有独立 blueprint 阶段；蓝图确认是 outline 的小步。
 * 工具集只定义，过滤要等影子期之后的 enforce（默认仍把全量工具交给模型）。
 */

export type AgentPhaseId =
  | "config"
  | "literature"
  | "outline"
  | "draft"
  | "citation"
  | "abstract"
  | "review"
  | "diagnose";

export interface AgentPhaseState {
  phase: AgentPhaseId;
  /** 对应 PHASE_TASK_PACKS 编号（兼容旧简报）。outline 可以是 2 或 3 */
  packPhase: number;
  subStep?: string;
  /** 唯一主建议（原 suggestNextAgentActions[0]） */
  nextAction: string | null;
  /** 下一个要写的节（起草阶段） */
  nextSectionKey?: string | null;
  /** 完成条件的人话描述（状态卡与 UI 用） */
  doneWhen: string;
}

/** 每个阶段都给的只读工具 */
export const ALWAYS_ON_TOOLS = [
  "inspect_project",
  "read_section",
  "read_project_asset",
  "list_references",
  "read_reference",
  "recall_recent_work",
  "update_work_memory",
  "ask_user",
  "read_attachment",
  "list_attachments",
  "read_figure",
] as const;

export interface PhaseSubStep {
  id: string;
  tools: readonly string[];
  until: string;
}

export interface PhaseToolset {
  tools: readonly string[];
  /** 综述 / 研究型差异。起草：综述可检索导入，研究型不加 */
  byMode?: Partial<Record<"review" | "research", readonly string[]>>;
  /** 阶段内小步（文献小步从 PHASE-09 起才用来限制工具） */
  subSteps?: readonly PhaseSubStep[];
}

/**
 * 附录 A 初版。注册表里还有附录未列的工具，挂到最近的阶段，避免永远不在任何集合里：
 * analyze_direction → literature；审查/核查/降重 → review。
 */
export const PHASE_TOOLSETS: Record<AgentPhaseId, PhaseToolset> = {
  config: {
    tools: ["update_paper_config"],
  },
  literature: {
    tools: [
      "search_knowledge",
      "search_external",
      "import_reference",
      "save_reference_classification",
      "read_full_text",
      "analyze_direction",
    ],
    subSteps: [
      { id: "local", tools: ["search_knowledge"], until: "本地已搜过一次或无命中" },
      {
        id: "external",
        tools: ["search_knowledge", "search_external"],
        until: "外部检索有命中",
      },
      {
        id: "import",
        tools: ["search_knowledge", "search_external", "import_reference"],
        until: "本轮导入完成或用户说够了",
      },
    ],
  },
  outline: {
    tools: [
      "generate_outline",
      "generate_writing_blueprint",
      "open_blueprint_workspace",
    ],
    subSteps: [
      { id: "outline", tools: ["generate_outline"], until: "大纲经用户批准" },
      {
        id: "blueprint",
        tools: ["generate_writing_blueprint", "open_blueprint_workspace"],
        until: "写作蓝图经用户批准",
      },
    ],
  },
  draft: {
    tools: [
      "write_section",
      "refine_content",
      "list_plot_sources",
      "generate_chart",
      "plot_peak_stack",
      "plot_panel_grid",
      "plot_curve_overlay",
      "generate_table",
      "draft_mechanism_figure",
      "illustrate_mechanism_figure",
      "remove_figure",
      "ingest_project_data",
      "generate_xrd_analysis",
    ],
    byMode: {
      review: ["search_knowledge", "import_reference"],
      research: [],
    },
    subSteps: [
      { id: "read", tools: ["list_plot_sources"], until: "读过本节上下文" },
      {
        id: "write",
        tools: ["write_section", "refine_content"],
        until: "本节写回且质检结论已出",
      },
    ],
  },
  citation: {
    tools: ["validate_citations", "refine_content", "remove_references"],
    subSteps: [
      { id: "check", tools: ["validate_citations"], until: "引用检查已跑过" },
      {
        id: "fix",
        tools: ["refine_content", "remove_references"],
        until: "导出就绪且无错引，或用户说先这样",
      },
    ],
  },
  abstract: {
    tools: ["write_bilingual_abstract"],
  },
  review: {
    tools: [
      "run_review_rounds",
      "check_plagiarism",
      "parse_revision_comments",
      "apply_revision_item",
      "export_manuscript_markdown",
      "review_content",
      "verify_content",
      "check_consistency",
      "rewrite_plagiarism",
    ],
  },
  diagnose: {
    tools: [],
  },
};

export function toolsForPhase(phase: AgentPhaseId, mode?: string): string[] {
  const spec = PHASE_TOOLSETS[phase];
  const modeExtra =
    mode === "review" || mode === "research" ? (spec.byMode?.[mode] ?? []) : [];
  return [...new Set([...ALWAYS_ON_TOOLS, ...spec.tools, ...modeExtra])];
}
