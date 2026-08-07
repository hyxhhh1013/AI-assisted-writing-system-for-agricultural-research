import { describe, expect, it } from "vitest";
import {
  checkAbstractFinishGate,
  checkCitationCheckGate,
  checkCitationSideTripGate,
  checkDiagnoseInspectGate,
  checkDraftSearchGate,
  checkReviewRequestGate,
  citationCheckReportReady,
  hasCitationRefineSuccess,
  isAcademicPaperPipelineGoal,
  isAbstractFinishGoal,
  isReviewRequestGoal,
  isCitationApplyGoal,
  isCitationCheckGoal,
  isDiagnoseStyleGoal,
  isReviewWritingGoal,
  isSectionDraftGoal,
  isReferenceClassificationGoal,
  referenceClassificationNudge,
  parseLiteratureImportTarget,
  pickIntentNudge,
  pickIntentStopAsk,
  resolveApPipelineStep,
  shouldSkipPlanner,
} from "@/lib/agent/core/goal-intents";
import type { IntentClosureContext } from "@/lib/agent/core/goal-intents";
import type { ToolObservation } from "@/lib/agent/types";

/** 成功观察快捷构造 */
const ok = (tool: string, data?: unknown): ToolObservation => ({
  tool,
  success: true,
  ...(data !== undefined ? { data } : {}),
});

describe("goal-intents", () => {
  it("detects diagnose and draft goals", () => {
    expect(isDiagnoseStyleGoal("看看项目现在卡在哪，建议下一步")).toBe(true);
    expect(isSectionDraftGoal("写引言")).toBe(true);
    expect(isSectionDraftGoal("检索并导入 1 篇文献")).toBe(false);
    expect(isReviewWritingGoal("写一篇生物炭综述")).toBe(true);
  });

  it("parses literature import target count", () => {
    expect(parseLiteratureImportTarget("检索并导入文献")).toBe(15);
    expect(parseLiteratureImportTarget("写生物炭土壤改良综述")).toBe(30);
    expect(parseLiteratureImportTarget("导入 5 篇相关文献")).toBe(5);
    expect(parseLiteratureImportTarget("至少 40 篇文献")).toBe(40);
    expect(parseLiteratureImportTarget("搜一篇生物炭论文")).toBe(1);
    expect(parseLiteratureImportTarget("找几篇热解相关文献")).toBe(15);
  });

  it("skips planner for diagnose and simple section draft", () => {
    expect(shouldSkipPlanner("看看项目现在卡在哪")).toBe(true);
    expect(shouldSkipPlanner("写引言")).toBe(true);
    expect(shouldSkipPlanner("检查引用并汇报可疑项")).toBe(true);
    expect(shouldSkipPlanner("写一篇生物炭综述")).toBe(false);
    expect(shouldSkipPlanner("检索并导入文献")).toBe(false);
  });

  it("detects citation check goals", () => {
    expect(isCitationCheckGoal("继续修正引用")).toBe(true);
    expect(isCitationCheckGoal("检查当前引用")).toBe(true);
    expect(isCitationCheckGoal("检索并导入文献")).toBe(false);
  });

  it("detects academic-paper pipeline goals", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    expect(isAcademicPaperPipelineGoal(goal)).toBe(true);
    expect(isCitationCheckGoal(goal)).toBe(false);
    expect(isSectionDraftGoal(goal)).toBe(false);
    expect(shouldSkipPlanner(goal)).toBe(true);
    expect(resolveApPipelineStep(goal, [])).toBe("citation_check");
  });

  it("resolves pipeline steps after validate and refine", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const afterValidate = [ok("validate_citations", { exportReady: false })];
    expect(resolveApPipelineStep(goal, afterValidate)).toBe("citation_fix");
    const blocked = checkCitationSideTripGate(
      goal,
      "write_bilingual_abstract",
      afterValidate,
    );
    expect(blocked.ok).toBe(false);
    const afterRefine = [
      ...afterValidate,
      ok("refine_content", { persisted: true }),
    ];
    expect(resolveApPipelineStep(goal, afterRefine)).toBe("abstract");
    expect(
      checkCitationSideTripGate(goal, "write_bilingual_abstract", afterRefine).ok,
    ).toBe(true);
  });

  it("review step completes with either run_review_rounds or review_content", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const beforeReview = [
      ok("validate_citations", { exportReady: false }),
      ok("refine_content", { persisted: true }),
      ok("write_bilingual_abstract"),
    ];
    expect(resolveApPipelineStep(goal, beforeReview)).toBe("review");
    expect(
      resolveApPipelineStep(goal, [...beforeReview, ok("run_review_rounds")]),
    ).toBeNull();
    expect(
      resolveApPipelineStep(goal, [...beforeReview, ok("review_content")]),
    ).toBeNull();
  });

  it("detects citation apply after validate report with issues", () => {
    const observations = [ok("validate_citations", { exportReady: false })];
    expect(isCitationApplyGoal("好", observations)).toBe(true);
    expect(isCitationApplyGoal("好", [])).toBe(false);
    expect(shouldSkipPlanner("好", observations)).toBe(true);
    expect(citationCheckReportReady(observations)).toBe(true);
  });

  it("自查通过后（0 问题）不再误判为引用修正：跟聊「好/继续」放行 write_section", () => {
    // 上一轮写完自查 validate_citations 通过（0 问题）——只是 reflectNode 例行动作，非用户引用核查请求
    const cleanValidate = [
      ok("write_section", { persisted: true, section: "introduction" }),
      ok("validate_citations", {
        exportReady: true,
        phase5Passed: true,
        grounding: { suspiciousCount: 0 },
      }),
    ];
    expect(isCitationApplyGoal("继续", cleanValidate)).toBe(false);
    expect(isCitationApplyGoal("好", cleanValidate)).toBe(false);
    expect(
      checkCitationSideTripGate("继续", "write_section", cleanValidate).ok,
    ).toBe(true);
  });

  it("自查通过后（0 问题）不把 AP 流程顶到引用修正阶段：起草 write_section 放行", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const cleanValidate = [
      ok("validate_citations", {
        exportReady: true,
        phase5Passed: true,
        grounding: { suspiciousCount: 0 },
      }),
    ];
    expect(resolveApPipelineStep(goal, cleanValidate)).not.toBe("citation_fix");
    expect(
      checkCitationSideTripGate(goal, "write_section", cleanValidate).ok,
    ).toBe(true);
  });

  it("blocks side trips during citation check", () => {
    const blocked = checkCitationSideTripGate(
      "检查引用",
      "search_external",
      [],
    );
    expect(blocked.ok).toBe(false);
    expect(
      checkCitationSideTripGate("检查引用", "validate_citations", []).ok,
    ).toBe(true);
  });

  it("blocks side trips during citation apply until refine", () => {
    const observations = [ok("validate_citations", { exportReady: false })];
    const blocked = checkCitationSideTripGate("好", "import_reference", observations);
    expect(blocked.ok).toBe(false);
    const afterRefine = [
      ...observations,
      ok("refine_content", { persisted: true }),
    ];
    expect(hasCitationRefineSuccess(afterRefine)).toBe(true);
    expect(
      checkCitationSideTripGate("好", "import_reference", afterRefine).ok,
    ).toBe(true);
  });

  it("blocks excessive read_reference before validate_citations", () => {
    const lines = [
      ok("read_reference"),
      ok("read_reference"),
      ok("read_reference"),
      ok("read_reference"),
    ];
    const blocked = checkCitationCheckGate("检查引用", "read_reference", lines);
    expect(blocked.ok).toBe(false);
    expect(checkCitationCheckGate("检查引用", "read_reference", [
      ...lines,
      ok("validate_citations"),
    ]).ok).toBe(true);
  });

  it("diagnose blocks other tools before inspect", () => {
    const blocked = checkDiagnoseInspectGate(
      "看看项目现在卡在哪",
      "recall_recent_work",
      [],
    );
    expect(blocked.ok).toBe(false);

    const after = checkDiagnoseInspectGate(
      "看看项目现在卡在哪",
      "search_external",
      [ok("inspect_project")],
    );
    expect(after.ok).toBe(true);
  });

  it("draft blocks search even after context read", () => {
    const blocked = checkDraftSearchGate("写引言", "search_external", []);
    expect(blocked.ok).toBe(false);

    const afterInspect = checkDraftSearchGate("写引言", "search_knowledge", [
      ok("inspect_project"),
    ]);
    expect(afterInspect.ok).toBe(false);
  });

  it("review writing allows search to gather refs", () => {
    expect(checkDraftSearchGate("写一篇生物炭综述", "search_external", []).ok).toBe(
      true,
    );
  });

  it("literature hunt allows search without prior read", () => {
    expect(
      checkDraftSearchGate(
        "检索并导入 1 篇与生物炭相关的文献",
        "search_external",
        [],
      ).ok,
    ).toBe(true);
  });
});

describe("intent continuation pickers", () => {
  function ctx(overrides: Partial<IntentClosureContext> = {}): IntentClosureContext {
    return {
      goal: "",
      observations: [],
      searchedOk: false,
      importCount: 0,
      importTarget: 15,
      refTotal: 0,
      wroteOk: false,
      ...overrides,
    };
  }

  const AP_GOAL = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";

  it("returns null when nothing is incomplete", () => {
    expect(pickIntentNudge(ctx())).toBeNull();
    expect(pickIntentStopAsk(ctx())).toBeNull();
  });

  it("nudges academic-paper citation_fix step after validate with issues", () => {
    const observations = [ok("validate_citations", { exportReady: false })];
    expect(pickIntentNudge(ctx({ goal: AP_GOAL, observations }))).toContain(
      "refine_content",
    );
  });

  it("nudges citation_check step and has no stop-ask", () => {
    expect(pickIntentNudge(ctx({ goal: AP_GOAL }))).toContain("validate_citations");
    expect(pickIntentStopAsk(ctx({ goal: AP_GOAL }))).toBeNull();
  });

  it("nudges literature hunt toward import after a search", () => {
    const nudge = pickIntentNudge(
      ctx({ goal: "检索并导入 5 篇文献", searchedOk: true, refTotal: 0, importTarget: 5 }),
    );
    expect(nudge).toContain("import_reference");
  });

  it("stops to ask user for draft when write_section not persisted", () => {
    const nudge = pickIntentNudge(ctx({ goal: "写引言", refTotal: 5 }));
    expect(nudge).toContain("write_section");
    const stop = pickIntentStopAsk(ctx({ goal: "写引言", refTotal: 5 }));
    expect(stop).toContain("继续写");
  });

  it("prioritizes review_write over nothing when refs enough but body missing", () => {
    const c = ctx({ goal: "写一篇生物炭综述", refTotal: 30, importTarget: 30 });
    expect(pickIntentNudge(c)).toContain("write_section(literature_body)");
    expect(pickIntentStopAsk(c)).toContain("综述正文尚未写回");
  });

  it("nudge order and stop-ask order diverge for AP pipeline + literature", () => {
    // 同一组合 goal：引用修正未写回（pipeline_fix）+ 文献未足（literature）同时成立。
    // NUDGE_ORDER 先 AP 流程 → nudge 应提 refine_content；
    // STOP_ORDER 先文献 → stopAsk 应优先问文献体量。
    const observations = [ok("validate_citations", { exportReady: false })];
    const c = ctx({
      goal: "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查，并检索导入 5 篇文献",
      observations,
      refTotal: 2,
      importTarget: 5,
      importCount: 0,
    });
    expect(pickIntentNudge(c)).toContain("refine_content");
    expect(pickIntentStopAsk(c)).toContain("本轮已导入");
  });

  it("abstract_finish: 收口/定稿目标识别", () => {
    expect(isAbstractFinishGoal("帮我收口，写双语摘要")).toBe(true);
    expect(isAbstractFinishGoal("把摘要补一下")).toBe(true);
    expect(isAbstractFinishGoal("引用核查一下")).toBe(false);
    expect(
      isAbstractFinishGoal("按 academic-paper 流程继续：起草→引用检查→双语摘要→审查"),
    ).toBe(false);
  });

  it("abstract_finish gate: 放行摘要工具、拦截检索/导入", () => {
    const goal = "帮我收口写摘要";
    expect(
      checkAbstractFinishGate(goal, "write_bilingual_abstract", []).ok,
    ).toBe(true);
    expect(checkAbstractFinishGate(goal, "read_section", []).ok).toBe(true);
    const blocked = checkAbstractFinishGate(goal, "search_knowledge", []);
    expect(blocked.ok).toBe(false);
    const blockedImport = checkAbstractFinishGate(goal, "import_reference", []);
    expect(blockedImport.ok).toBe(false);
  });

  it("abstract_finish: 未写摘要时 nudge 到 write_bilingual_abstract；已写后不再 nudge", () => {
    const goal = "帮我收口写摘要";
    expect(pickIntentNudge(ctx({ goal }))).toContain("write_bilingual_abstract");
    // 已成功写过摘要 → 意图完成，不再 nudge
    expect(
      pickIntentNudge(ctx({ goal, observations: [ok("write_bilingual_abstract")] })),
    ).toBeNull();
  });

  it("review_request: 审查/审稿目标识别（与综述写作、收口摘要区分）", () => {
    expect(isReviewRequestGoal("帮我审查一下这篇论文")).toBe(true);
    expect(isReviewRequestGoal("按审稿意见修改")).toBe(true);
    expect(isReviewRequestGoal("写一篇生物炭综述")).toBe(false);
    expect(isReviewRequestGoal("帮我收口写摘要")).toBe(false);
  });

  it("review_request gate: 放行审查/解析工具、拦截写正文与检索", () => {
    const goal = "帮我审查这篇论文";
    expect(checkReviewRequestGate(goal, "run_review_rounds", []).ok).toBe(true);
    expect(checkReviewRequestGate(goal, "parse_revision_comments", []).ok).toBe(true);
    expect(checkReviewRequestGate(goal, "read_section", []).ok).toBe(true);
    const blocked = checkReviewRequestGate(goal, "write_section", []);
    expect(blocked.ok).toBe(false);
    expect(checkReviewRequestGate(goal, "search_knowledge", []).ok).toBe(false);
  });

  it("review_request: 未出审查报告时 nudge；已审查后不再 nudge", () => {
    const goal = "帮我审查这篇论文";
    const nudge = pickIntentNudge(ctx({ goal }));
    expect(nudge).toContain("run_review_rounds");
    // 已成功产出审查 → 意图完成
    expect(
      pickIntentNudge(ctx({ goal, observations: [ok("run_review_rounds")] })),
    ).toBeNull();
  });
});

describe("文献分类编码意图", () => {
  it("识别分类编码类目标", () => {
    expect(isReferenceClassificationGoal("先做文献分类编码")).toBe(true);
    expect(isReferenceClassificationGoal("给这些文献分个类")).toBe(true);
    expect(isReferenceClassificationGoal("写引言")).toBe(false);
    expect(isReferenceClassificationGoal("帮我检索文献")).toBe(false);
  });

  it("nudge 引导一次 list_references + save_reference_classification，禁止多次检索", () => {
    const nudge = referenceClassificationNudge();
    expect(nudge).toContain("list_references");
    expect(nudge).toContain("save_reference_classification");
    expect(nudge).toContain("禁止用多次");
  });
});
