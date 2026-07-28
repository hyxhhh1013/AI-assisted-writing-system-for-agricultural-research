/**
 * 用户 goal 意图门禁 — 抗跨会话记忆带偏 / 写稿时无谓检索
 */

export type GoalIntentGateResult =
  | { ok: true }
  | { ok: false; error: string };

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

/**
 * 文献导入目标篇数。
 * 综述 / 检索导入默认 **30**（用户明确要求综述不能只有几篇）；
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
  if (isReviewWritingGoal(goal) || isLiteratureHuntGoal(goal)) return 30;
  if (/几篇|若干|多篇|一批|一些文献/.test(goal)) return 15;
  return 30;
}

/** 起草某一节（引言/讨论/综述等），非检索任务 */
export function isSectionDraftGoal(goal: string): boolean {
  if (isLiteratureHuntGoal(goal)) return false;
  return (
    /写引言|写讨论|写方法|写结果|写结论|写综述|起草|扩写.*节|write\s*(the\s*)?(introduction|discussion|review)/i.test(
      goal,
    )
    || (/写/.test(goal)
      && /引言|讨论|方法|结果|结论|综述|introduction|discussion|literature/i.test(goal))
  );
}

function lineMentionsTool(line: string, name: string): boolean {
  return line.includes(`[${name}]`) || line.includes(name);
}

function hasSuccessfulInspect(recentToolLines: readonly string[]): boolean {
  return recentToolLines.some(
    (line) =>
      lineMentionsTool(line, "inspect_project")
      && !/失败|等待用户确认|已达/.test(line),
  );
}

/**
 * 诊断类 goal：除 inspect_project 外，其它工具须等 inspect 成功之后。
 */
export function checkDiagnoseInspectGate(
  goal: string,
  toolName: string,
  recentToolLines: readonly string[],
): GoalIntentGateResult {
  if (!isDiagnoseStyleGoal(goal)) return { ok: true };
  if (toolName === "inspect_project") return { ok: true };
  if (hasSuccessfulInspect(recentToolLines)) return { ok: true };
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
  _recentToolLines: readonly string[],
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
    + "立刻 import_reference(hitsJson=suggestedHitsJson, query, why≥8字) 分批导入（单次最多约 15 篇），不够再换一个同义 query 补一轮。"
    + "禁止只导几篇就停。命中离题则说明；禁止改题；禁止编造 hitJson。"
  );
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
