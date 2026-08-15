/**
 * W3-AP-ANTISPAM — 检索配额 + 无进展熔断
 * @see docs/plans/W3-AP-BEHAVIOR.md §3
 */

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

/**
 * 同 goal 内 search_external + search_knowledge 上限。
 * 综述需多轮换 query 凑 ~30 篇，8 次不够；20 次约可覆盖多源多同义检索。
 */
export const MAX_SEARCH_CALLS_PER_GOAL = 20;

/** 连续「本应推进项目却未改指纹」的工具次数上限 */
export const MAX_STAGNANT_TOOLS = 3;

/** 同一 goal 内 antispam 停滞熔断触发次数上限：达到后硬停机（进 finalize，不再放行工具） */
export const MAX_BREAKS_BEFORE_HARD_STOP = 2;

const SEARCH_TOOLS = new Set(["search_external", "search_knowledge"]);

/**
 * 取上下文只读工具：先读后写时会连续调用，不可计入空转
 * （否则读 3 篇文献就被红条打断，写作体验极差）
 */
export const CONTEXT_READ_TOOLS = new Set([
  "inspect_project",
  "read_project_asset",
  "read_section",
  "list_references",
  "read_reference",
  "list_plot_sources",
  "recall_recent_work",
  "read_full_text",
  "update_work_memory",
]);

/** 认为可能推进项目的工具（成功后应刷新 fingerprint） */
export const PROGRESS_TOOLS = new Set([
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
  "generate_chart",
  "generate_xrd_analysis",
  "generate_table",
  "draft_mechanism_figure",
  "remove_figure",
  "save_reference_classification",
  "remove_references",
  "validate_citations",
  "run_review_rounds",
]);

/**
 * 成功即算进展、但 fingerprint 可能捕不到的工具（分类映射 / 图表产物不在
 * sectionFills·refs 指纹里）。避免分类/出图后被误判空转。
 */
export const FINGERPRINT_BLIND_PROGRESS_TOOLS = new Set([
  "save_reference_classification",
  "ingest_project_data",
  "generate_chart",
  "generate_xrd_analysis",
  "generate_table",
  "draft_mechanism_figure",
  "remove_figure",
]);

export interface AntispamTracker {
  searchCount: number;
  stagnantCount: number;
  lastFingerprint: string;
  /** 停滞熔断已触发次数（跨工具轮累计，不随项目刷新清零）；达上限硬停机 */
  breakCount: number;
}

export function createAntispamTracker(
  snap?: AgentProjectSnapshot | null,
): AntispamTracker {
  return {
    searchCount: 0,
    stagnantCount: 0,
    lastFingerprint: projectFingerprint(snap),
    breakCount: 0,
  };
}

export function projectFingerprint(snap: AgentProjectSnapshot | null | undefined): string {
  if (!snap) return "none";
  const chars = (snap.sectionFills ?? []).reduce((a, s) => a + (s.chars || 0), 0);
  // 引用编号签名：refine_content 改引（如 [7]→[4]）字数不变但引用变化，靠它检测到实质进展
  const refs = (snap.sectionFills ?? [])
    .filter((s) => s.refNums)
    .map((s) => `${s.key}:${s.refNums}`)
    .join("|");
  return [
    snap.outline?.length ?? 0,
    snap.references?.length ?? 0,
    chars,
    refs,
    snap.referenceClassificationSig ?? "",
    snap.hasWritingBlueprint ? 1 : 0,
    snap.hasArgumentBlueprint ? 1 : 0,
    snap.hasPaperConfig ? 1 : 0,
    snap.currentPhase ?? "x",
  ].join("|");
}

export function checkSearchQuota(
  tracker: AntispamTracker,
  toolName: string,
): { allowed: boolean; warning?: string } {
  if (!SEARCH_TOOLS.has(toolName)) {
    return { allowed: true };
  }
  if (tracker.searchCount >= MAX_SEARCH_CALLS_PER_GOAL) {
    return {
      allowed: false,
      warning:
        `本轮检索已达 ${MAX_SEARCH_CALLS_PER_GOAL} 次上限。请停止 search_*，改用 list_references / 已有大纲继续，或直接用中文向用户汇报并询问是否继续搜。`,
    };
  }
  return { allowed: true };
}

/** 检索工具即将执行时计数（仅在通过配额后调用） */
export function noteSearchCall(tracker: AntispamTracker, toolName: string): void {
  if (SEARCH_TOOLS.has(toolName)) {
    tracker.searchCount += 1;
  }
}

/**
 * 工具执行后更新无进展计数。
 * @returns stagnant=true 时应软中断并要求模型总结问用户
 */
export function noteToolProgress(
  tracker: AntispamTracker,
  toolName: string,
  snapAfter: AgentProjectSnapshot | null | undefined,
  toolSuccess: boolean,
): { stagnant: boolean; warning?: string } {
  if (!toolSuccess) {
    return { stagnant: false };
  }

  const next = projectFingerprint(snapAfter);
  const changed = next !== tracker.lastFingerprint;

  // 检索 / 读上下文：不计入空转（写引言前连读多篇文献是正常路径）
  if (SEARCH_TOOLS.has(toolName) || CONTEXT_READ_TOOLS.has(toolName)) {
    if (changed) {
      tracker.lastFingerprint = next;
      tracker.stagnantCount = 0;
    }
    return { stagnant: false };
  }

  // 分类/图表等：成功即清空转（指纹可能捕不到产物）
  if (FINGERPRINT_BLIND_PROGRESS_TOOLS.has(toolName)) {
    if (changed) tracker.lastFingerprint = next;
    tracker.stagnantCount = 0;
    return { stagnant: false };
  }

  if (PROGRESS_TOOLS.has(toolName) && changed) {
    tracker.lastFingerprint = next;
    tracker.stagnantCount = 0;
    return { stagnant: false };
  }

  // 写工具未改指纹，或其他非只读工具空转：累计
  if (!changed) {
    tracker.stagnantCount += 1;
  } else {
    tracker.lastFingerprint = next;
    tracker.stagnantCount = 0;
    return { stagnant: false };
  }

  if (tracker.stagnantCount >= MAX_STAGNANT_TOOLS) {
    return {
      stagnant: true,
      warning:
        `已连续 ${tracker.stagnantCount} 次工具调用未改变项目状态（大纲/文献/章节等）。请停止调工具，用中文总结已掌握的信息，并明确询问用户下一步。`,
    };
  }
  return { stagnant: false };
}
