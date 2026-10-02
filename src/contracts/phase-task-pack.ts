/**
 * Passport 阶段任务包 — 对齐 academic-paper 八阶段；Agent 可自主补齐前置。
 * 阶段编号对齐 `paper-passport-progress` / `getNextPhaseHint`（0–7）。
 */

export type PhaseTaskToolHint =
  | "inspect_project"
  | "read_project_asset"
  | "update_paper_config"
  | "search_knowledge"
  | "search_external"
  | "list_references"
  | "import_reference"
  | "generate_outline"
  | "generate_writing_blueprint"
  | "build_argument_blueprint"
  | "open_blueprint_workspace"
  | "read_section"
  | "write_section"
  | "refine_content"
  | "list_plot_sources"
  | "generate_chart"
  | "validate_citations"
  | "write_bilingual_abstract"
  | "review_content"
  | "run_review_rounds"
  | "check_plagiarism"
  | "parse_revision_comments"
  | "apply_revision_item"
  | "export_manuscript_markdown"
  | "recall_recent_work";

export interface PhaseTaskPack {
  phase: number;
  title: string;
  /** 用户可见的一句话目标（也可作为 Agent goal） */
  goal: string;
  /** 推荐工具（顺序即建议执行序） */
  preferredTools: PhaseTaskToolHint[];
  /** 写入系统提示的约束 */
  constraints: string[];
  /** 人控兜底入口提示 */
  humanFallback: string;
}

export const PHASE_TASK_PACKS: Record<number, PhaseTaskPack> = {
  0: {
    phase: 0,
    title: "配置",
    goal: "确认论文题目、类型（综述/研究）、语言与引用格式已填写完整",
    preferredTools: ["read_project_asset", "update_paper_config"],
    constraints: ["先读 passport；缺项与用户确认后再 update_paper_config"],
    humanFallback: "打开 Cockpit / 项目设置完善 PaperConfig",
  },
  1: {
    phase: 1,
    title: "文献",
    goal: "按当前论文题目检索并导入参考文献（确认后入库）",
    preferredTools: [
      "list_references",
      "search_knowledge",
      "search_external",
      "import_reference",
    ],
    constraints: [
      "只跟当前题目所属方向检索，不要扫实验室其它方向",
      "先 list_references；已有文献够用就转入大纲，不要为凑篇数继续搜",
      "import_reference 需用户确认",
      "不要写成方向页的「研究缺口识别」或总结实验室四方向覆盖",
    ],
    humanFallback: "知识库 / 读者 Tab 导入文献",
  },
  2: {
    phase: 2,
    title: "架构",
    goal: "生成大纲与写作蓝图并写回；两份都要等用户批准后再写正文",
    preferredTools: [
      "read_project_asset",
      "generate_outline",
      "generate_writing_blueprint",
      "search_knowledge",
    ],
    constraints: [
      "先问用户出大纲还是贴骨架，再 generate_outline，批准后再 generate_writing_blueprint",
      "禁止在无大纲时 write_section",
      "大纲和蓝图写回后都停下来等人批准",
    ],
    humanFallback: "大纲/蓝图过目页",
  },
  3: {
    phase: 3,
    title: "蓝图确认",
    goal: "确认写作蓝图已含各节主张/证据（claim/evidenceHint）；缺则 generate_writing_blueprint 或打开蓝图工作台",
    preferredTools: [
      "read_project_asset",
      "generate_writing_blueprint",
      "open_blueprint_workspace",
    ],
    constraints: [
      "论证已并入写作蓝图，勿再 build_argument_blueprint",
      "生成/确认后用中文说明中心论点与写作顺序",
    ],
    humanFallback: "蓝图工作台",
  },
  4: {
    phase: 4,
    title: "起草",
    goal: "为当前空白的核心章节调用 write_section 写回正文（优先引言或第一个空白节）",
    preferredTools: [
      "read_section",
      "read_project_asset",
      "search_knowledge",
      "write_section",
      "list_plot_sources",
      "generate_chart",
    ],
    constraints: [
      "必须已有大纲 + 写作蓝图（含各节论证要点）",
      "一次只写用户指定的一节或一个子节，写回后停下来问下一节",
      "综述 literature_body：蓝图有多子节时必须带 subsectionTitle 逐节写，禁止一次写完整章万字",
      "写完说明章节 key 与字数；有数据时可配图",
    ],
    humanFallback: "章节协作 Tab 人控扩写",
  },
  5: {
    phase: 5,
    title: "引用",
    goal: "检查项目正文引用编号是否越界或缺失，给出可执行修改建议",
    preferredTools: ["list_references", "validate_citations"],
    constraints: ["以 validate_citations 结果为准，不编造文献"],
    humanFallback: "质量中心 / 引用检查",
  },
  6: {
    phase: 6,
    title: "摘要",
    goal: "基于已写正文生成中英双语摘要并写回项目",
    preferredTools: ["read_project_asset", "write_bilingual_abstract"],
    constraints: ["必须已有正文草稿", "摘要禁止文内引用标记"],
    humanFallback: "调用双语摘要 API 或 Agent 工具",
  },
  7: {
    phase: 7,
    title: "审查",
    goal: "运行下一轮论文审查（最多 2 轮）；若有外审意见则解析修订路线图",
    preferredTools: [
      "run_review_rounds",
      "check_plagiarism",
      "parse_revision_comments",
      "apply_revision_item",
      "export_manuscript_markdown",
    ],
    constraints: [
      "优先 run_review_rounds（不要无故 force）",
      "满 2 轮后不要重复审查，改为总结 Top 问题",
      "外审意见：parse_revision_comments → 按 priorityOrder 逐条 apply_revision_item",
      "交付前可 export_manuscript_markdown 检查引用就绪",
    ],
    humanFallback: "质量中心「下一轮审查」或粘贴审稿意见给 Agent",
  },
};

export function getPhaseTaskPack(phase: number): PhaseTaskPack {
  const clamped = Math.min(7, Math.max(0, Math.floor(phase)));
  return PHASE_TASK_PACKS[clamped] ?? PHASE_TASK_PACKS[1];
}
