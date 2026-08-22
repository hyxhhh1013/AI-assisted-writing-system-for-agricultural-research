/**
 * Agent 工具步骤 → 用户可读文案（UI 进度条 / 工具卡）
 */

const TOOL_LABELS: Record<string, string> = {
  inspect_project: "查看项目状态",
  read_project_asset: "读取项目资产",
  open_blueprint_workspace: "打开蓝图工作台",
  read_section: "读取章节",
  list_references: "列出参考文献",
  list_plot_sources: "查看可配图数据",
  ingest_project_data: "入库试验数据",
  search_knowledge: "检索知识库",
  search_external: "外部文献检索",
  search_external_literature: "外部文献检索",
  read_full_text: "获取全文",
  generate_outline: "生成大纲",
  generate_writing_blueprint: "生成写作蓝图",
  build_argument_blueprint: "论证蓝图（已弃用）",
  write_section: "撰写章节",
  refine_content: "润色修正",
  validate_citations: "检查引用",
  write_bilingual_abstract: "双语摘要",
  run_review_rounds: "论文审查",
  check_plagiarism: "查重",
  import_reference: "导入文献",
  save_reference_classification: "文献分类",
  remove_references: "删除文献",
  remove_figure: "删除图表",
  generate_chart: "生成图表",
  draft_mechanism_figure: "生成机理图",
  generate_xrd_analysis: "XRD 分析",
  update_paper_config: "更新论文配置",
  parse_revision_comments: "解析审稿意见",
  apply_revision_item: "按意见修改章节",
  export_manuscript_markdown: "导出 Markdown 手稿",
  recall_recent_work: "回顾近期工作",
  update_work_memory: "更新工作记忆",
  analyze_direction: "分析方向",
  review_content: "内容审查",
  verify_content: "核查内容",
};

export function toolDisplayName(tool: string): string {
  return TOOL_LABELS[tool] ?? tool;
}

const SECTION_LABELS: Record<string, string> = {
  abstract: "摘要",
  introduction: "引言",
  background: "研究现状",
  literature_body: "综述正文",
  methods: "方法",
  results: "结果",
  discussion: "讨论",
  conclusion: "结论",
};

export function sectionDisplayName(key: unknown): string {
  const k = String(key ?? "").trim();
  return SECTION_LABELS[k] || k || "章节";
}

/** 是否为给模型看的软门禁，不应在 UI 里用红色报错吓人 */
export function isSoftToolNotice(error?: string | null): boolean {
  if (!error) return false;
  return (
    /未改变项目状态|请停止调工具|连续调用|连续多次|已达.*上限|请先调用|请先读|validate_citations|不要逐条 read_reference|当前目标是写章节|本轮是诊断|需要用户在界面确认|改换策略|停止重复/.test(
      error,
    )
  );
}

/** 软提示 → 用户向文案 */
export function humanizeToolNotice(error: string): string {
  if (/未改变项目状态/.test(error)) {
    return "已读完一批上下文，正在整理后继续…若停住了，你可以直接说「继续写」或换个要求。";
  }
  if (/连续.+\d+ 次读取同一章节|同一章节窗口|停止空转读取|已因连续重复读取被隔离/.test(error)) {
    return "这一段已经读过了。硬检若已通过，可以直接写摘要，不必再翻页。";
  }
  if (/连续调用.*参数实质相同|停止重复/.test(error)) {
    return "这个步骤刚做过，正在调整策略…";
  }
  if (/检索已达.*上限/.test(error)) {
    return "本轮检索次数已用完，将用已有文献继续。";
  }
  if (/需要用户在界面确认/.test(error)) {
    return "需要你确认后才能继续。";
  }
  if (/请先读|请先调用 inspect|先取上下文|validate_citations 一次性|不要逐条 read_reference/.test(error)) {
    return "正在补读项目上下文，随后将运行引用核查…";
  }
  if (/当前目标是写章节/.test(error)) {
    return "本轮以写作为主，跳过额外检索。";
  }
  return error.length > 80 ? `${error.slice(0, 80)}…` : error;
}

/** 进行中文案（工具已发出、尚无 observation） */
export function formatToolWorkingLine(
  tool: string,
  params: Record<string, unknown> = {},
): string {
  switch (tool) {
    case "inspect_project":
      return "正在查看项目进度…";
    case "list_references":
      return "正在整理参考文献列表…";
    case "read_reference": {
      const idx = params.index ?? params.n ?? params.refIndex;
      return idx != null ? `正在阅读文献 [${idx}]…` : "正在阅读文献…";
    }
    case "read_project_asset": {
      const asset = String(params.asset ?? params.name ?? "").trim();
      const map: Record<string, string> = {
        outline: "大纲",
        writing_blueprint: "写作蓝图",
        argument_blueprint: "论证蓝图",
        passport: "论文配置",
        analysis_notes: "分析笔记",
        abstract: "摘要",
      };
      return asset
        ? `正在读取${map[asset] ?? asset}…`
        : "正在读取项目资料…";
    }
    case "read_section":
      return `正在阅读「${sectionDisplayName(params.section)}」…`;
    case "search_knowledge":
      return "正在检索知识库…";
    case "search_external":
      return "正在检索外部文献…";
    case "import_reference":
      return "准备导入文献…";
    case "save_reference_classification":
      return "正在保存文献分类…";
    case "remove_references":
      return "正在删除不相关文献…";
    case "open_blueprint_workspace":
      return "正在打开蓝图工作台…";
    case "generate_outline":
      return "正在生成大纲…";
    case "generate_writing_blueprint":
      return "正在生成写作蓝图…";
    case "build_argument_blueprint":
      return "正在梳理论证结构…";
    case "write_section":
      return `正在撰写「${sectionDisplayName(params.section)}」…`;
    case "refine_content":
      return `正在润色「${sectionDisplayName(params.section)}」…`;
    case "validate_citations":
      return "正在检查引用…";
    case "write_bilingual_abstract":
      return "正在写双语摘要…";
    case "generate_chart":
      return "正在生成图表…";
    case "ingest_project_data":
      return "正在把表格写入项目数据…";
    case "run_review_rounds":
      return "正在审查文稿…";
    default:
      return `正在${toolDisplayName(tool)}…`;
  }
}

/** 参数一行摘要（代替裸 JSON） */
export function formatToolParamHint(
  tool: string,
  params: Record<string, unknown>,
): string | null {
  if (!params || Object.keys(params).length === 0) return null;
  switch (tool) {
    case "read_reference": {
      const idx = params.index ?? params.n;
      return idx != null ? `文献 [${idx}]` : null;
    }
    case "read_section":
    case "write_section":
    case "refine_content":
      return params.section ? sectionDisplayName(params.section) : null;
    case "read_project_asset":
      return params.asset ? String(params.asset) : null;
    case "search_external":
    case "search_knowledge": {
      const q = String(params.query ?? "").trim();
      return q ? (q.length > 28 ? `${q.slice(0, 28)}…` : q) : null;
    }
    case "ingest_project_data": {
      const name = String(params.fileName ?? "").trim();
      if (name) return name;
      const id = String(params.attachmentId ?? params.fileId ?? "").trim();
      return id ? `附件 ${id.slice(0, 8)}` : null;
    }
    case "import_reference": {
      // 优先显示真实批量数：确认卡勾选（selectedIndices）> 候选列表（importItems）> 模型入参
      if (Array.isArray(params.selectedIndices) && params.selectedIndices.length > 0) {
        return `${params.selectedIndices.length} 篇`;
      }
      if (Array.isArray(params.importItems) && params.importItems.length > 0) {
        return `${params.importItems.length} 篇`;
      }
      const hits = params.hitsJson ?? params.hitJson;
      if (typeof hits === "string") {
        try {
          const parsed = JSON.parse(hits) as unknown;
          if (Array.isArray(parsed)) return `${parsed.length} 篇`;
          return "1 篇";
        } catch {
          return null;
        }
      }
      return null;
    }
    default:
      return null;
  }
}

/** 根据 agent status + 最新消息推断底部「正在做什么」 */
export function resolveLiveProgress(input: {
  status: string;
  isRunning: boolean;
  messages: ReadonlyArray<{
    kind: string;
    tool?: string;
    params?: Record<string, unknown>;
    text?: string;
  }>;
}): string | null {
  if (!input.isRunning) return null;

  for (let i = input.messages.length - 1; i >= 0; i--) {
    const m = input.messages[i];
    if (m.kind === "observation" || m.kind === "summary" || m.kind === "user") {
      break;
    }
    if (m.kind === "action" && m.tool) {
      return formatToolWorkingLine(m.tool, m.params ?? {});
    }
  }

  switch (input.status) {
    case "planning":
      return "正在规划本轮步骤…";
    case "executing":
      return "正在执行工具…";
    case "finalizing":
      return "正在整理回复…";
    case "thinking":
    default:
      return "正在思考下一步…";
  }
}
