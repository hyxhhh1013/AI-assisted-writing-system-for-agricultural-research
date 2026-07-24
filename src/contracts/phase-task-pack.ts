/**
 * Passport 阶段任务包 — Agent 执行器化（W3-PHASE-PACK）
 * 阶段编号对齐 `paper-passport-progress` / `getNextPhaseHint`（0–7）。
 */

export type PhaseTaskToolHint =
  | "search_knowledge"
  | "search_external"
  | "import_reference"
  | "build_argument_blueprint"
  | "write_section"
  | "refine_content"
  | "validate_citations"
  | "write_bilingual_abstract"
  | "review_content"
  | "run_review_rounds"
  | "check_plagiarism";

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
    preferredTools: [],
    constraints: ["本阶段以人控配置为主，Agent 不写正文"],
    humanFallback: "打开 Cockpit / 项目设置完善 PaperConfig",
  },
  1: {
    phase: 1,
    title: "文献",
    goal: "检索与题目相关的实验室文献，总结缺口，必要时导入参考文献",
    preferredTools: ["search_knowledge", "search_external", "import_reference"],
    constraints: ["先检索再总结；import_reference 需用户确认", "不要撰写章节正文"],
    humanFallback: "知识库 / 读者 Tab 导入文献",
  },
  2: {
    phase: 2,
    title: "结构",
    goal: "帮助完善大纲要点与结构建议；提醒用户在提纲 Tab 生成大纲与写作蓝图",
    preferredTools: ["search_knowledge"],
    constraints: [
      "禁止 write_section / refine_content / build_argument_blueprint",
      "可给出大纲条目建议，但权威大纲以工作台提纲为准",
    ],
    humanFallback: "提纲 Tab：生成大纲 → 写作蓝图",
  },
  3: {
    phase: 3,
    title: "论证",
    goal: "基于现有大纲生成论证蓝图（主张—证据—推理）并写回项目",
    preferredTools: ["build_argument_blueprint"],
    constraints: ["必须已有大纲", "生成后用中文说明中心论点与链条数量"],
    humanFallback: "提纲侧栏「论证蓝图」",
  },
  4: {
    phase: 4,
    title: "起草",
    goal: "为当前空白的核心章节调用 write_section 写回正文（优先引言或第一个空白节）",
    preferredTools: ["search_knowledge", "write_section"],
    constraints: [
      "必须已有大纲",
      "优先空白章节；一次任务通常只写一节",
      "写完说明章节 key 与字数",
    ],
    humanFallback: "章节协作 Tab 人控扩写",
  },
  5: {
    phase: 5,
    title: "引用",
    goal: "检查项目正文引用编号是否越界或缺失，给出可执行修改建议",
    preferredTools: ["validate_citations"],
    constraints: ["以 validate_citations 结果为准，不编造文献"],
    humanFallback: "质量中心 / 引用检查",
  },
  6: {
    phase: 6,
    title: "摘要",
    goal: "基于已写正文生成中英双语摘要并写回项目",
    preferredTools: ["write_bilingual_abstract"],
    constraints: ["必须已有正文草稿", "摘要禁止文内引用标记"],
    humanFallback: "调用双语摘要 API 或 Agent 工具",
  },
  7: {
    phase: 7,
    title: "审查",
    goal: "运行下一轮论文审查（最多 2 轮）；若未满 2 轮则继续，满轮后汇总问题",
    preferredTools: ["run_review_rounds", "check_plagiarism"],
    constraints: [
      "优先 run_review_rounds（不要无故 force）",
      "满 2 轮后不要重复审查，改为总结 Top 问题",
    ],
    humanFallback: "质量中心「下一轮审查」",
  },
};

export function getPhaseTaskPack(phase: number): PhaseTaskPack {
  const clamped = Math.min(7, Math.max(0, Math.floor(phase)));
  return PHASE_TASK_PACKS[clamped] ?? PHASE_TASK_PACKS[1];
}
