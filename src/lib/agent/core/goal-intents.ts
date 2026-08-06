/**
 * 用户 goal 意图门禁 — 抗跨会话记忆带偏 / 写稿时无谓检索
 */

import type { ToolObservation } from "@/lib/agent/types";

export type GoalIntentGateResult =
  | { ok: true }
  | { ok: false; error: string };

/** 该工具是否存在成功记录 */
function hasSuccessfulTool(
  observations: readonly ToolObservation[],
  toolName: string,
): boolean {
  return observations.some((o) => o.tool === toolName && o.success);
}

/** 该工具成功次数 */
function countSuccessfulTool(
  observations: readonly ToolObservation[],
  toolName: string,
): number {
  return observations.filter((o) => o.tool === toolName && o.success).length;
}

/** 工具成功且已写回项目（data.persisted 非空；对应摘要里的「已写回」语义） */
function hasPersistedTool(
  observations: readonly ToolObservation[],
  toolName: string,
): boolean {
  return observations.some(
    (o) =>
      o.tool === toolName
      && o.success
      && o.data != null
      && (o.data as { persisted?: unknown }).persisted != null,
  );
}

/** 累计成功导入篇数（import_reference.data.imported，含批量） */
export function sumImportedCount(observations: readonly ToolObservation[]): number {
  return observations
    .filter((o) => o.tool === "import_reference" && o.success)
    .reduce((n, o) => {
      const imported = (o.data as { imported?: unknown } | undefined)?.imported;
      return n + (typeof imported === "number" ? imported : Number(imported) || 0);
    }, 0);
}

/** 诊断卡点：必须先看最新项目快照 */
export function isDiagnoseStyleGoal(goal: string): boolean {
  return /卡在哪|项目现状|诊断|进度如何|现在怎样|看看项目|建议下一步|缺什么|瓶颈/.test(
    goal,
  );
}

/** 明确要求检索/导入文献 */
export function isLiteratureHuntGoal(goal: string): boolean {
  return /检索|搜索|搜一篇|搜几篇|导入.*文献|找.*文献|search.*paper|文献库|导入\s*\d|补充.*文献|找几篇|备齐.*文献|扩充.*文献/.test(
    goal,
  );
}

/** 综述 / literature review（文献体量要求更高） */
export function isReviewWritingGoal(goal: string): boolean {
  return /综述|literature\s*review|literature_body|系统综述|文献综述/i.test(goal);
}

/** academic-paper 多步流程（起草→引用检查→双语摘要→审查） */
export function isAcademicPaperPipelineGoal(goal: string): boolean {
  return (
    /academic-paper\s*流程|八阶段流程|完整流程继续/i.test(goal)
    || /起草→引用|引用检查→双语|双语摘要→审查|引用.*→.*摘要.*→.*审查/.test(goal)
  );
}

export type ApPipelineStep =
  | "citation_check"
  | "citation_fix"
  | "abstract"
  | "review";

function hasSuccessfulAbstractWrite(observations: readonly ToolObservation[]): boolean {
  // 摘要工具成功即算（对应摘要「已生成/已写回」语义）
  return hasSuccessfulTool(observations, "write_bilingual_abstract");
}

function hasSuccessfulReview(observations: readonly ToolObservation[]): boolean {
  // run_review_rounds 走 Passport Phase 7 轮次；review_content 一次性四维审查，
  // 两者都产出四维审查报告，任一成功即视为 review 步完成
  return (
    hasSuccessfulTool(observations, "run_review_rounds")
    || hasSuccessfulTool(observations, "review_content")
  );
}

/** 解析 academic-paper 流程当前应执行的子步骤 */
export function resolveApPipelineStep(
  goal: string,
  observations: readonly ToolObservation[],
): ApPipelineStep | null {
  if (!isAcademicPaperPipelineGoal(goal)) return null;
  if (!citationCheckReportReady(observations)) return "citation_check";
  if (!hasCitationRefineSuccess(observations)) return "citation_fix";
  if (!hasSuccessfulAbstractWrite(observations)) return "abstract";
  if (!hasSuccessfulReview(observations)) return "review";
  return null;
}

/** 引用核查 / 错引检查（应对齐 validate_citations，勿逐条 read_reference） */
export function isCitationCheckGoal(goal: string): boolean {
  if (isLiteratureHuntGoal(goal)) return false;
  if (isAcademicPaperPipelineGoal(goal)) return false;
  return (
    /引用核查|引用检查|检查引用|核查引用|检查.*引用|当前引用|validate.*citation|citation.*check|错引|越界引用|引用.*(问题|归属|接地|修正|纠正)/i.test(
      goal,
    )
    || (/继续.*(修正|纠正).*引用|修正.*引用|核对.*引用/.test(goal))
  );
}

function hasSuccessfulValidateCitations(observations: readonly ToolObservation[]): boolean {
  return hasSuccessfulTool(observations, "validate_citations");
}

/** 本轮是否已成功产出引用核查报告 */
export function citationCheckReportReady(observations: readonly ToolObservation[]): boolean {
  return hasSuccessfulValidateCitations(observations);
}

/** 短确认：用户同意执行上轮引用修正方案（跟聊 goal 常为「好」） */
const CITATION_APPLY_SHORT =
  /^(好|好的|可以|行|开始|执行|确认|同意|继续|按方案|就这样)[。!！?？\s]*$/;

/** 用户已确认应用引用修正（须已有 validate_citations 报告） */
export function isCitationApplyGoal(
  goal: string,
  observations: readonly ToolObservation[],
): boolean {
  if (!citationCheckReportReady(observations)) return false;
  const g = goal.trim();
  if (CITATION_APPLY_SHORT.test(g)) return true;
  return /执行.*修正|按.*方案.*改|开始.*refine|应用.*修正|修正.*引用|改引|refine_content/i.test(
    g,
  );
}

/** 引用核查或确认修正阶段（禁止岔去检索/写摘要） */
export function isCitationFlowGoal(
  goal: string,
  observations: readonly ToolObservation[],
): boolean {
  const pipelineStep = resolveApPipelineStep(goal, observations);
  if (pipelineStep === "citation_check" || pipelineStep === "citation_fix") {
    return true;
  }
  return isCitationCheckGoal(goal) || isCitationApplyGoal(goal, observations);
}

/** 本轮是否已成功 refine_content 写回 */
export function hasCitationRefineSuccess(observations: readonly ToolObservation[]): boolean {
  return hasPersistedTool(observations, "refine_content");
}

/** 诊断 / 单节起草 / 引用核查·修正 / AP 流程：跳过 Planner LLM，直接进对话循环 */
export function shouldSkipPlanner(
  goal: string,
  observations: readonly ToolObservation[] = [],
): boolean {
  if (isDiagnoseStyleGoal(goal)) return true;
  if (isAcademicPaperPipelineGoal(goal)) return true;
  if (isCitationCheckGoal(goal)) return true;
  if (isCitationApplyGoal(goal, observations)) return true;
  if (isSectionDraftGoal(goal) && !isReviewWritingGoal(goal)) return true;
  return false;
}

/**
 * 文献导入目标篇数。
 * 综述默认 **30**；普通检索/备文献默认 **15**（降低空转）；
 * 「导入N篇」尊重数字（上限 50）；「一篇」→1。
 */
export function parseLiteratureImportTarget(goal: string): number {
  const m =
    goal.match(/导入\s*(\d+)\s*篇/)
    || goal.match(/搜\s*(\d+)\s*篇/)
    || goal.match(/找\s*(\d+)\s*篇/)
    || goal.match(/至少\s*(\d+)\s*篇/)
    || goal.match(/(\d+)\s*篇/);
  if (m) return Math.min(Math.max(Number(m[1]), 1), 50);
  if (/一篇|1\s*篇|搜一篇/.test(goal) && !isReviewWritingGoal(goal)) return 1;
  if (isReviewWritingGoal(goal)) return 30;
  if (/几篇|若干|多篇|一批|一些文献/.test(goal)) return 15;
  if (isLiteratureHuntGoal(goal)) return 15;
  return 15;
}

/** 起草某一节（引言/讨论/综述等），非检索任务 */
export function isSectionDraftGoal(goal: string): boolean {
  if (isLiteratureHuntGoal(goal)) return false;
  if (isAcademicPaperPipelineGoal(goal)) return false;
  return (
    /写引言|写讨论|写方法|写结果|写结论|写综述|起草|扩写.*节|write\s*(the\s*)?(introduction|discussion|review)/i.test(
      goal,
    )
    || (/写/.test(goal)
      && /引言|讨论|方法|结果|结论|综述|introduction|discussion|literature/i.test(goal))
  );
}

function hasSuccessfulInspect(observations: readonly ToolObservation[]): boolean {
  return hasSuccessfulTool(observations, "inspect_project");
}

/**
 * 诊断类 goal：除 inspect_project 外，其它工具须等 inspect 成功之后。
 */
export function checkDiagnoseInspectGate(
  goal: string,
  toolName: string,
  observations: readonly ToolObservation[],
): GoalIntentGateResult {
  if (!isDiagnoseStyleGoal(goal)) return { ok: true };
  if (toolName === "inspect_project") return { ok: true };
  if (hasSuccessfulInspect(observations)) return { ok: true };
  return {
    ok: false,
    error:
      "本轮是诊断任务：请先调用 inspect_project 读取最新项目快照，再决定检索/写回。"
      + "不要仅凭【近期对话记忆】或 recall_recent_work 下结论。",
  };
}

/**
 * 写节类 goal（且用户未要求检索）：全程禁止 search_*，避免 inspect 后仍岔去搜文献。
 * 例外：写综述允许边搜边导，以凑够文献体量。
 * 检索任务由 isLiteratureHuntGoal 识别，不会进入本门禁。
 */
export function checkDraftSearchGate(
  goal: string,
  toolName: string,
  _observations: readonly ToolObservation[],
): GoalIntentGateResult {
  if (!isSectionDraftGoal(goal)) return { ok: true };
  if (isReviewWritingGoal(goal)) return { ok: true };
  if (toolName !== "search_external" && toolName !== "search_knowledge") {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      "当前目标是写章节，不是检索。请先 inspect / read_project_asset(outline) / list_references，"
      + "再 write_section（缺蓝图时系统会自动补齐）；若确需新文献，请用户明确说「检索」或「找文献」。",
  };
}

/** 诊断任务开场系统提示（注入 messages） */
export function diagnoseGoalNudge(): string {
  return (
    "【系统】本轮是诊断任务：必须先调用 inspect_project，再基于最新快照用中文说明缺口与 1～3 个下一步。"
    + "【近期对话记忆】仅供参考，不能替代 inspect；不要直接 import_reference / write_section。"
  );
}

/** 写节任务开场提示 */
export function draftGoalNudge(goal = ""): string {
  if (isReviewWritingGoal(goal)) {
    const n = parseLiteratureImportTarget(goal);
    return (
      `【系统】写综述：先 inspect / list_references。参考文献通常至少约 ${n} 篇；`
      + "不足则多轮 search_knowledge / search_external + import_reference(hitsJson=...) 分批导入，"
      + "达标后再 write_section(literature_body)。禁止只用两三篇硬写综述。"
    );
  }
  return (
    "【系统】本轮目标是写章节：先 inspect 或 read_project_asset(outline)/list_references，"
    + "然后直接 write_section（缺大纲/蓝图时系统会自动补齐）。"
    + "不要停下来只问「要不要写」；除非用户明确要求检索，否则不要先 search_external。"
  );
}

/** 检索导入任务开场提示 */
export function literatureHuntNudge(goal = ""): string {
  const n = parseLiteratureImportTarget(goal);
  return (
    "【系统】本轮是检索并导入：优先 search_knowledge；外部用 search_external（中文自动转英文）。"
    + `默认目标约 ${n} 篇。效率优先：单次 limit=20～25，用 1～2 个宽泛英文 query 即可，不要碎成很多次小搜；`
    + "立刻 import_reference(hitIndices=data.suggestedHitIndices, query, why≥8字) 分批导入（单次最多约 15 篇，hitIndices 最省 token 不截断；也可 hitsJson），不够再换一个同义 query 补一轮。"
    + "禁止只导几篇就停。命中离题则说明；禁止改题；禁止编造 hitJson。"
  );
}

/** 引用核查任务开场提示 */
export function citationCheckNudge(): string {
  return (
    "【系统】本轮是引用核查：可选 list_references 或 read_section 看正文，"
    + "然后立刻 validate_citations（一次检查全文：越界硬检 + 语义可疑项）。"
    + "用中文汇报报告中的 suspicious [n]；仅对个别可疑编号再 read_reference。"
    + "禁止无报告地连读多篇 read_reference；禁止 search_* / import_reference / write_bilingual_abstract。"
  );
}

/** academic-paper 流程子步骤提示 */
export function apPipelineNudge(
  goal: string,
  observations: readonly ToolObservation[],
): string {
  const step = resolveApPipelineStep(goal, observations);
  switch (step) {
    case "citation_check":
      return (
        "【系统】academic-paper 流程·①引用检查：可选 read_section，然后立刻 validate_citations（一次全文）。"
        + "用中文汇报 suspicious [n]；禁止 search/import/写摘要。"
      );
    case "citation_fix":
      return (
        "【系统】academic-paper 流程·②引用修正：按 validate 报告，read_section(literature_body/background) "
        + "+ refine_content(section=..., draftText=全文, feedback=改引清单, persistToProject=true) 写回。"
        + "不要只 read；修正完成前禁止 write_bilingual_abstract。"
      );
    case "abstract":
      return (
        "【系统】academic-paper 流程·③双语摘要：立刻 write_bilingual_abstract 写回 abstract（唯一空白节）。"
        + "不要再去检索或逐条 read_reference。"
      );
    case "review":
      return (
        "【系统】academic-paper 流程·④审查：调用 run_review_rounds（Phase 7 轮次）或 review_content 产出四维度审查报告。"
      );
    default:
      return (
        "【系统】academic-paper 流程各步已完成。可 inspect_project 确认，或指定下一步。"
      );
  }
}

/** 用户确认修正方案后的跟聊提示 */
export function citationApplyNudge(): string {
  return (
    "【系统】用户已确认引用修正方案。请按上轮清单执行："
    + "1) read_section(literature_body) 取全文；"
    + "2) refine_content(section=literature_body, draftText=全文, feedback=修正清单, persistToProject=true)；"
    + "3) 若 background/introduction 也有错引，同样 read_section + refine_content。"
    + "禁止 search_external / search_knowledge / import_reference / write_bilingual_abstract / write_section。"
    + "不要只 read 不写回。"
  );
}

const CITATION_SIDE_TRIP_TOOLS = new Set([
  "search_external",
  "search_knowledge",
  "import_reference",
  "write_bilingual_abstract",
  "write_section",
  "generate_outline",
  "generate_writing_blueprint",
  "build_argument_blueprint",
]);

const PIPELINE_SEARCH_TOOLS = new Set([
  "search_external",
  "search_knowledge",
  "import_reference",
]);

/**
 * 引用核查/修正阶段禁止岔去检索、导入、写摘要或其它写节。
 * academic-paper 流程按子步骤放行（如修正完成后允许 write_bilingual_abstract）。
 */
export function checkCitationSideTripGate(
  goal: string,
  toolName: string,
  observations: readonly ToolObservation[],
): GoalIntentGateResult {
  const pipelineStep = resolveApPipelineStep(goal, observations);
  if (pipelineStep) {
    if (pipelineStep === "abstract" && toolName === "write_bilingual_abstract") {
      return { ok: true };
    }
    if (
      pipelineStep === "review"
      && (toolName === "run_review_rounds" || toolName === "review_content")
    ) {
      return { ok: true };
    }
    if (pipelineStep === "citation_fix" && toolName === "refine_content") {
      return { ok: true };
    }
    if (pipelineStep === "citation_check" && toolName === "validate_citations") {
      return { ok: true };
    }
    if (pipelineStep === "citation_fix" && CITATION_SIDE_TRIP_TOOLS.has(toolName)) {
      return {
        ok: false,
        error:
          "academic-paper 流程·引用修正阶段：请先 read_section + refine_content 按报告改引写回，"
          + "完成后再 write_bilingual_abstract。",
      };
    }
    if (
      pipelineStep === "citation_check"
      && CITATION_SIDE_TRIP_TOOLS.has(toolName)
    ) {
      return {
        ok: false,
        error:
          "academic-paper 流程·引用检查阶段：请先 validate_citations 出报告，"
          + "不要检索/导入/写摘要。",
      };
    }
    if (
      (pipelineStep === "abstract" || pipelineStep === "review")
      && PIPELINE_SEARCH_TOOLS.has(toolName)
    ) {
      return {
        ok: false,
        error:
          "academic-paper 流程·摘要/审查阶段：请勿检索或导入文献，专注 write_bilingual_abstract 或 run_review_rounds / review_content。",
      };
    }
    return { ok: true };
  }

  if (!isCitationFlowGoal(goal, observations)) return { ok: true };
  if (!CITATION_SIDE_TRIP_TOOLS.has(toolName)) return { ok: true };
  if (
    isCitationApplyGoal(goal, observations)
    && hasCitationRefineSuccess(observations)
  ) {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      "当前是引用核查/修正任务，请勿检索、导入文献、写摘要或其它章节。"
      + "请 validate_citations 出报告，或 read_section + refine_content 按方案改引写回。",
  };
}

/**
 * 引用核查：未跑 validate_citations 前，限制逐条 read_reference（易卡住）。
 */
export function checkCitationCheckGate(
  goal: string,
  toolName: string,
  observations: readonly ToolObservation[],
): GoalIntentGateResult {
  const pipelineStep = resolveApPipelineStep(goal, observations);
  const inCitationCheck =
    isCitationCheckGoal(goal)
    || pipelineStep === "citation_check";
  if (!inCitationCheck) return { ok: true };
  if (toolName === "validate_citations") return { ok: true };
  if (toolName !== "read_reference") return { ok: true };
  if (hasSuccessfulValidateCitations(observations)) return { ok: true };

  const readRefCount = countSuccessfulTool(observations, "read_reference");
  if (readRefCount >= 4) {
    return {
      ok: false,
      error:
        "引用核查应先用 validate_citations 一次性检查全文（硬检 + 语义可疑项），"
        + "不要逐条 read_reference。请立刻调用 validate_citations（可省略 draftText），"
        + "再针对报告中的 suspicious [n] 选择性 read_reference。",
    };
  }
  return { ok: true };
}

/** 写综述前文献不足时的提醒 */
export function reviewRefsShortageNudge(refCount: number, target = 30): string | null {
  if (refCount >= target) return null;
  return (
    `【系统】当前项目参考文献仅 ${refCount} 篇，写综述通常至少需要约 ${target} 篇。`
    + "请先多轮 search_external / search_knowledge + import_reference 批量导入，"
    + "达到体量后再 write_section(literature_body)。不要只用两三篇硬写综述。"
  );
}

/** 意图续跑用尽：写入 finalThought，停下来问用户（非假 user 续跑） */
export function buildIntentStopAskUser(opts: {
  kind:
    | "literature"
    | "draft"
    | "review_write"
    | "citation"
    | "citation_apply"
    | "pipeline_fix"
    | "pipeline_abstract"
    | "pipeline_review";
  refTotal: number;
  importTarget: number;
  importCount: number;
}): string {
  if (opts.kind === "pipeline_fix") {
    return (
      "\n\n——\n引用修正尚未写回。请说「继续修正引用」或直接让 Agent 对 literature_body 执行 refine_content。"
    );
  }
  if (opts.kind === "pipeline_abstract") {
    return (
      "\n\n——\n双语摘要尚未写回。请说「写摘要」或「write_bilingual_abstract」。"
    );
  }
  if (opts.kind === "pipeline_review") {
    return (
      "\n\n——\n审查尚未运行。请说「运行审查」或「run_review_rounds / review_content」。"
    );
  }
  if (opts.kind === "citation_apply") {
    return (
      "\n\n——\n引用修正尚未写回。你可以说「继续修正」或「对 literature_body 执行 refine_content」。"
    );
  }
  if (opts.kind === "citation") {
    return (
      "\n\n——\n引用核查尚未出报告。你可以说「继续核查」或「运行 validate_citations 并汇报可疑引用」。"
    );
  }
  if (opts.kind === "draft") {
    return (
      "\n\n——\n章节尚未写回。你可以直接说「继续写」或补充要求（例如先改大纲、先补文献）。"
    );
  }
  if (opts.kind === "review_write") {
    return (
      `\n\n——\n文献约 ${opts.refTotal} 篇（目标约 ${opts.importTarget}），综述正文尚未写回。`
      + "可以说「继续凑文献」「直接写综述」或调整目标篇数。"
    );
  }
  return (
    `\n\n——\n本轮已导入约 ${opts.importCount} 篇，项目现有 ${opts.refTotal} 篇`
    + `（目标约 ${opts.importTarget}）。可以说「继续检索导入」「先用现有文献」或指定篇数。`
  );
}

/** 跟聊时按 observations 注入意图提示（如「好」→ 引用修正） */
export function mergeFollowUpGoalHint(
  goal: string,
  observations: readonly ToolObservation[],
): string | null {
  if (isAcademicPaperPipelineGoal(goal)) {
    return apPipelineNudge(goal, observations);
  }
  if (isCitationApplyGoal(goal, observations)) {
    return citationApplyNudge();
  }
  if (isDiagnoseStyleGoal(goal)) {
    return diagnoseGoalNudge();
  }
  if (isCitationCheckGoal(goal)) {
    return citationCheckNudge();
  }
  return null;
}

/** 把意图提示并进首条用户消息，避免额外假 user 轮次 */
export function mergeGoalWithIntentHint(goal: string): string {
  if (isAcademicPaperPipelineGoal(goal)) {
    return `${goal}\n\n${apPipelineNudge(goal, [])}`;
  }
  if (isDiagnoseStyleGoal(goal)) {
    return `${goal}\n\n${diagnoseGoalNudge()}`;
  }
  if (isCitationCheckGoal(goal)) {
    return `${goal}\n\n${citationCheckNudge()}`;
  }
  if (isLiteratureHuntGoal(goal)) {
    return `${goal}\n\n${literatureHuntNudge(goal)}`;
  }
  if (isSectionDraftGoal(goal)) {
    return `${goal}\n\n${draftGoalNudge(goal)}`;
  }
  return goal;
}

/* ==================== 意图收尾续跑表（agentNode 提前结束时用） ==================== */

/**
 * 意图续跑判断所需的会话上下文。
 * agentNode 在 Agent 提前结束时计算一次注入，避免各处重复 parse goal / observations。
 */
export interface IntentClosureContext {
  goal: string;
  observations: ToolObservation[];
  /** 本轮是否有检索成功 */
  searchedOk: boolean;
  /** 本轮累计成功导入篇数 */
  importCount: number;
  /** 文献目标篇数 */
  importTarget: number;
  /** 项目现有文献数 */
  refTotal: number;
  /** 是否已成功 write_section 写回（含批量） */
  wroteOk: boolean;
}

export type IntentKind =
  | "pipeline_fix"
  | "pipeline_abstract"
  | "pipeline_review"
  | "pipeline_check"
  | "citation_apply"
  | "literature"
  | "draft"
  | "review_write"
  | "citation";

export interface IntentClosureEntry {
  kind: IntentKind;
  /** 该意图处于「未完成」状态（主导且缺关键动作） */
  isIncomplete: (ctx: IntentClosureContext) => boolean;
  /** 续跑轻推（预算用尽前每轮注入） */
  nudge: (ctx: IntentClosureContext) => string | null;
  /** 停下问用户 */
  stopAsk: (ctx: IntentClosureContext) => string | null;
}

function importedOk(ctx: IntentClosureContext): boolean {
  return ctx.refTotal >= ctx.importTarget || ctx.importCount >= ctx.importTarget;
}

function reviewShort(ctx: IntentClosureContext): string | null {
  return isReviewWritingGoal(ctx.goal)
    ? reviewRefsShortageNudge(ctx.refTotal, ctx.importTarget)
    : null;
}

function stopAskOpts(ctx: IntentClosureContext): {
  refTotal: number;
  importTarget: number;
  importCount: number;
} {
  return {
    refTotal: ctx.refTotal,
    importTarget: ctx.importTarget,
    importCount: ctx.importCount,
  };
}

const INTENT_CLOSURES: Record<IntentKind, IntentClosureEntry> = {
  pipeline_fix: {
    kind: "pipeline_fix",
    isIncomplete: (ctx) =>
      resolveApPipelineStep(ctx.goal, ctx.observations) === "citation_fix",
    nudge: () =>
      "【系统】academic-paper 流程·引用修正：read_section(literature_body) 后立刻 "
      + "refine_content(section=literature_body, draftText=全文, feedback=validate 报告中的改引清单, persistToProject=true)。"
      + "background/introduction 有错引时同样 refine。不要只 read；不要写摘要直到 refine 写回。",
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "pipeline_fix", ...stopAskOpts(ctx) }),
  },
  pipeline_abstract: {
    kind: "pipeline_abstract",
    isIncomplete: (ctx) =>
      resolveApPipelineStep(ctx.goal, ctx.observations) === "abstract",
    nudge: () =>
      "【系统】academic-paper 流程·双语摘要：引用已修正，请立刻 write_bilingual_abstract 写回 abstract。",
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "pipeline_abstract", ...stopAskOpts(ctx) }),
  },
  pipeline_review: {
    kind: "pipeline_review",
    isIncomplete: (ctx) =>
      resolveApPipelineStep(ctx.goal, ctx.observations) === "review",
    nudge: () =>
      "【系统】academic-paper 流程·审查：请调用 run_review_rounds（Phase 7 轮次）或 review_content 产出审查报告。",
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "pipeline_review", ...stopAskOpts(ctx) }),
  },
  pipeline_check: {
    kind: "pipeline_check",
    isIncomplete: (ctx) =>
      resolveApPipelineStep(ctx.goal, ctx.observations) === "citation_check",
    nudge: () =>
      "【系统】academic-paper 流程·引用检查：请立刻 validate_citations（一次全文），汇报 suspicious [n]。",
    // 引用检查未出报告时无专属「问用户」文案，落到通用收尾
    stopAsk: () => null,
  },
  citation_apply: {
    kind: "citation_apply",
    isIncomplete: (ctx) =>
      isCitationApplyGoal(ctx.goal, ctx.observations)
      && !hasCitationRefineSuccess(ctx.observations),
    nudge: () =>
      "【系统】用户已确认引用修正，但尚未 refine_content 写回。"
      + "请 read_section(literature_body) 后立刻 refine_content(section=literature_body, draftText=全文, feedback=上轮修正清单)。"
      + "background/introduction 有错引时同样处理。不要只 read 不写回；不要 search/import/写摘要。",
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "citation_apply", ...stopAskOpts(ctx) }),
  },
  literature: {
    kind: "literature",
    isIncomplete: (ctx) =>
      (isLiteratureHuntGoal(ctx.goal) || Boolean(reviewShort(ctx))) && !importedOk(ctx),
    nudge: (ctx) => {
      if (ctx.importCount === 0 && ctx.refTotal < ctx.importTarget && ctx.searchedOk) {
        return `【系统】已检索但项目文献仍不足（现有 ${ctx.refTotal} 篇，目标约 ${ctx.importTarget} 篇）。`
          + `请立刻批量 import_reference(hitsJson=suggestedHitsJson, query, why≥8字)；不够则换 query 再搜再导。`;
      }
      if (!ctx.searchedOk && ctx.refTotal < ctx.importTarget) {
        return `【系统】写综述/备文献需要约 ${ctx.importTarget} 篇，当前仅 ${ctx.refTotal} 篇。`
          + "请先 search_knowledge / search_external（多换同义英文 query），再分批 import_reference。";
      }
      return `【系统】已有/本轮导入合计仍不足：项目 ${ctx.refTotal} 篇，本轮导入约 ${ctx.importCount} 篇，目标约 ${ctx.importTarget} 篇。`
        + "请继续 search + import_reference(hitsJson=...) 补足。";
    },
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "literature", ...stopAskOpts(ctx) }),
  },
  draft: {
    kind: "draft",
    isIncomplete: (ctx) =>
      isSectionDraftGoal(ctx.goal) && !isReviewWritingGoal(ctx.goal) && !ctx.wroteOk,
    nudge: () =>
      "【系统】用户要写章节，但尚未成功 write_section 写回。"
      + "请先读大纲/文献（或 inspect），再直接 write_section（蓝图可自动补）；不要只提问。",
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "draft", ...stopAskOpts(ctx) }),
  },
  review_write: {
    kind: "review_write",
    isIncomplete: (ctx) =>
      isReviewWritingGoal(ctx.goal) && importedOk(ctx) && !ctx.wroteOk,
    nudge: () =>
      "【系统】文献体量已够，请 list_references 核对后 write_section(literature_body) 写回综述正文。",
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "review_write", ...stopAskOpts(ctx) }),
  },
  citation: {
    kind: "citation",
    isIncomplete: (ctx) =>
      isCitationCheckGoal(ctx.goal) && !citationCheckReportReady(ctx.observations),
    nudge: () =>
      "【系统】用户要做引用核查，但尚未成功 validate_citations。"
      + "请立刻调用 validate_citations（默认检查全文），用中文汇报硬检结果与 suspicious [n]；"
      + "不要继续逐条 read_reference。",
    stopAsk: (ctx) =>
      buildIntentStopAskUser({ kind: "citation", ...stopAskOpts(ctx) }),
  },
};

/**
 * nudge 注入优先顺序（与历史行为一致）：先 academic-paper 流程子步，再引用应用，
 * 再文献/写作/引用核查。
 */
const NUDGE_ORDER: IntentKind[] = [
  "pipeline_fix",
  "pipeline_abstract",
  "pipeline_review",
  "pipeline_check",
  "citation_apply",
  "literature",
  "draft",
  "review_write",
  "citation",
];

/**
 * 「停下问用户」优先顺序。注意与 NUDGE_ORDER 不同：文献/写作在前
 * （continue 预算用尽前先轻推 AP 流程，用尽后优先问用户文献/写作等用户驱动强意图）。
 */
const STOP_ORDER: IntentKind[] = [
  "literature",
  "draft",
  "review_write",
  "pipeline_fix",
  "pipeline_abstract",
  "pipeline_review",
  "citation_apply",
  "citation",
];

/** 意图未完成时选一条续跑 nudge（按 NUDGE_ORDER 优先级；无则 null） */
export function pickIntentNudge(ctx: IntentClosureContext): string | null {
  for (const kind of NUDGE_ORDER) {
    const entry = INTENT_CLOSURES[kind];
    if (entry.isIncomplete(ctx)) return entry.nudge(ctx);
  }
  return null;
}

/** 意图未完成时选一条「停下问用户」文案（按 STOP_ORDER 优先级；无则 null） */
export function pickIntentStopAsk(ctx: IntentClosureContext): string | null {
  for (const kind of STOP_ORDER) {
    const entry = INTENT_CLOSURES[kind];
    if (entry.isIncomplete(ctx)) return entry.stopAsk(ctx);
  }
  return null;
}
