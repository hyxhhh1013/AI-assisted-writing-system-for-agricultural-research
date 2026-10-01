/** Admin 后台展示用标签常量 */

export const ADMIN_TPL_LABEL: Record<string, string> = {
  sci: "SCI",
  ieee: "IEEE",
  gbt7713: "GB/T 7713",
  nature: "Nature",
};

export const ADMIN_MODE_LABEL: Record<string, string> = {
  review: "综述",
  research: "研究",
};

export const ADMIN_ROLE_LABEL: Record<string, string> = {
  admin: "管理员",
  user: "用户",
};

export const ADMIN_AGENT_STATUS_LABEL: Record<string, string> = {
  running: "运行中",
  interrupted: "已中断",
  completed: "已完成",
  error: "出错",
};

export const ADMIN_ROADMAP_STATUS_LABEL: Record<string, string> = {
  planned: "计划中",
  writing: "撰写中",
  submitted: "已投稿",
  published: "已发表",
};

export const ADMIN_GRADE_COLOR: Record<string, string> = {
  A: "bg-green-50 text-green-700",
  B: "bg-blue-50 text-blue-700",
  C: "bg-amber-50 text-amber-700",
  D: "bg-red-50 text-red-700",
};

export const ADMIN_RISK_BADGE: Record<string, string> = {
  high: "bg-red-50 text-red-700",
  medium: "bg-amber-50 text-amber-700",
  low: "bg-green-50 text-green-700",
};

export const ADMIN_RISK_LABEL: Record<string, string> = {
  high: "高风险",
  medium: "中风险",
  low: "低风险",
};

export const ADMIN_REVIEW_DIM_LABEL: Record<string, string> = {
  academic: "学术规范",
  argument: "论证质量",
  structure: "结构规范",
  integrity: "学术诚信",
};

export function adminTplLabel(template: string): string {
  return ADMIN_TPL_LABEL[template] ?? template;
}

export function adminModeLabel(mode: string): string {
  return ADMIN_MODE_LABEL[mode] ?? mode ?? "综述";
}

/** UsageLog / AI 调用 feature 键 → 运维可读标签 */
export const ADMIN_FEATURE_LABEL: Record<string, string> = {
  "ai:deepseek": "DeepSeek",
  "ai:zhipu": "智谱",
  "ai:vision": "DeepSeek 视觉",
  writing: "扩写",
  outline: "大纲",
  review: "审查",
  plagiarism: "查重",
  agent: "Agent",
  translate: "翻译",
  chart: "绘图",
};

export function adminFeatureLabel(feature: string): string {
  if (ADMIN_FEATURE_LABEL[feature]) return ADMIN_FEATURE_LABEL[feature];
  if (feature.startsWith("ai:")) return feature.slice(3);
  return feature;
}

export function adminRoleLabel(role: string): string {
  return ADMIN_ROLE_LABEL[role] ?? role;
}

export function adminAgentStatusLabel(status: string): string {
  return ADMIN_AGENT_STATUS_LABEL[status]
    ?? ({ done: "完成", skipped: "跳过", pending: "待执行" } as Record<string, string>)[status]
    ?? status;
}

/** Agent 工具名 → 运维可读标签 */
export const ADMIN_TOOL_LABEL: Record<string, string> = {
  search_external: "外部检索",
  search_knowledge: "知识库检索",
  import_reference: "导入参考文献",
  list_references: "列参考文献",
  read_section: "读章节",
  write_section: "写章节",
  refine_content: "润色",
  inspect_project: "检查项目",
  read_project_asset: "读项目资产",
  ask_user: "询问用户",
  update_work_memory: "更新工作记忆",
  generate_writing_blueprint: "生成写作蓝图",
  generate_chart: "生成图表",
  draft_mechanism_figure: "机理示意图",
  generate_outline: "生成大纲",
  review_content: "审查正文",
};

export function adminToolLabel(tool: string): string {
  return ADMIN_TOOL_LABEL[tool] ?? tool;
}

export const ADMIN_INTENT_KIND_LABEL: Record<string, string> = {
  pipeline_fix: "管道修复",
  pipeline_abstract: "摘要管道",
  pipeline_review: "审查管道",
  pipeline_check: "查重管道",
  citation_apply: "写回引用",
  abstract_finish: "收口摘要",
  review_request: "审查请求",
  literature: "文献",
  draft: "扩写",
  review_write: "综述",
  citation: "引用",
  diagnose: "诊断",
  classify: "分类",
  ap_full: "全流程",
};

export function adminIntentKindLabel(kind: string): string {
  return ADMIN_INTENT_KIND_LABEL[kind] ?? kind;
}

export const ADMIN_FAIL_VIA_LABEL: Record<string, string> = {
  fail: "执行失败",
  throw: "抛错",
  unknown: "未知工具",
  "pre-gate": "前门禁",
  "post-gate": "后门禁",
  budget: "配额",
};

export function adminFailViaLabel(via: string): string {
  return ADMIN_FAIL_VIA_LABEL[via] ?? via;
}

export function adminRoadmapStatusLabel(status: string): string {
  return ADMIN_ROADMAP_STATUS_LABEL[status] ?? status;
}
