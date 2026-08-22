import { describe, expect, it } from "vitest";
import {
  checkAbstractFinishGate,
  checkCitationCheckGate,
  checkCitationSpinGate,
  checkCitationSideTripGate,
  checkDiagnoseInspectGate,
  checkDraftSearchGate,
  checkOutlineSearchGate,
  checkReviewRequestGate,
  isExistingRefsOnlyGoal,
  isOutlineRevisionGoal,
  mergeGoalWithIntentHint,
  checkClassificationRetrieveGate,
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

  it("isSectionDraftGoal is regex-only; follow-up inherit lives in classifyIntent", () => {
    expect(isSectionDraftGoal("A")).toBe(false);
    expect(isSectionDraftGoal("继续")).toBe(false);
  });

  it("blocks search during draft follow-up when kind is draft even if goal is garbage", () => {
    expect(checkDraftSearchGate("A", "search_knowledge", [], "draft").ok).toBe(false);
    expect(checkDraftSearchGate("nonsense", "search_knowledge", [], "draft").ok).toBe(false);
    expect(checkDraftSearchGate("写引言", "search_knowledge", [], "literature").ok).toBe(true);
  });

  it("parses literature import target count", () => {
    expect(parseLiteratureImportTarget("检索并导入文献")).toBe(15);
    expect(parseLiteratureImportTarget("写生物炭土壤改良综述")).toBe(30);
    expect(parseLiteratureImportTarget("导入 5 篇相关文献")).toBe(5);
    expect(parseLiteratureImportTarget("至少 40 篇文献")).toBe(40);
    expect(parseLiteratureImportTarget("搜一篇生物炭论文")).toBe(1);
    expect(parseLiteratureImportTarget("找几篇热解相关文献")).toBe(15);
  });

  it("treats 基于 N 条文献修订大纲 as outline revision, not a search", () => {
    const goal = "基于 27 条文献修订大纲";
    expect(isOutlineRevisionGoal(goal)).toBe(true);
    expect(isExistingRefsOnlyGoal("先用现有 27 篇修订大纲，不要再 search_external")).toBe(
      true,
    );
    expect(checkOutlineSearchGate(goal, "search_external").ok).toBe(false);
    expect(checkOutlineSearchGate(goal, "generate_outline").ok).toBe(true);
    expect(checkOutlineSearchGate("检索并导入文献后生成大纲", "search_external").ok).toBe(
      true,
    );
    expect(shouldSkipPlanner(goal)).toBe(true);
    expect(mergeGoalWithIntentHint(goal, null)).toMatch(/禁止 search_external/);
  });

  it("skips planner for diagnose and simple section draft", () => {
    expect(shouldSkipPlanner("看看项目现在卡在哪")).toBe(true);
    expect(shouldSkipPlanner("写引言")).toBe(true);
    expect(shouldSkipPlanner("检查引用并汇报可疑项")).toBe(true);
    expect(shouldSkipPlanner("写一篇生物炭综述")).toBe(false);
    expect(shouldSkipPlanner("检索并导入文献")).toBe(false);
    expect(shouldSkipPlanner("garbage", [], "draft")).toBe(true);
    expect(shouldSkipPlanner("写引言", [], "literature")).toBe(false);
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
    // 起草未开始（无 write_section）→ 不套流水线门禁
    expect(resolveApPipelineStep(goal, [])).toBeNull();
  });

  it("stops paging the same section after hard-pass validate", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const softOnly = [
      ok("write_section", { persisted: true }),
      ok("validate_citations", {
        exportReady: true,
        phase5Passed: true,
        grounding: { suspiciousCount: 2 },
      }),
    ];
    expect(checkCitationSpinGate(goal, "read_section", softOnly).ok).toBe(false);
    expect(checkCitationSpinGate(goal, "read_reference", softOnly).ok).toBe(false);
    expect(checkCitationSpinGate(goal, "write_bilingual_abstract", softOnly).ok).toBe(
      true,
    );
    expect(
      checkCitationSpinGate("写引言", "read_section", softOnly, "draft").ok,
    ).toBe(true);
  });

  it("allows two section reads when hard citation issues remain, then stops", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const hard = [
      ok("write_section", { persisted: true }),
      ok("validate_citations", { exportReady: false, phase5Passed: false }),
    ];
    expect(checkCitationSpinGate(goal, "read_section", hard).ok).toBe(true);
    expect(
      checkCitationSpinGate(goal, "read_section", [
        ...hard,
        ok("read_section"),
        ok("read_section"),
      ]).ok,
    ).toBe(false);
  });

  it("soft-only suspicious citations do not trap AP flow in citation_fix", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const softOnly = [
      ok("write_section", { persisted: true }),
      ok("validate_citations", {
        exportReady: true,
        phase5Passed: true,
        grounding: { suspiciousCount: 21 },
      }),
    ];
    expect(resolveApPipelineStep(goal, softOnly)).toBe("abstract");
    expect(
      checkCitationSideTripGate(goal, "write_bilingual_abstract", softOnly).ok,
    ).toBe(true);
    expect(isCitationApplyGoal("好", softOnly)).toBe(false);
  });

  it("resolves pipeline steps after drafting, validate and refine", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const drafted = [ok("write_section", { persisted: true })];
    expect(resolveApPipelineStep(goal, drafted)).toBe("citation_check");
    const afterValidate = [...drafted, ok("validate_citations", { exportReady: false })];
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

  it("keeps drafting tools unblocked on an empty project (no write_section yet)", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    // 空项目：连 validate 都没跑，不应进入流水线门禁
    expect(resolveApPipelineStep(goal, [])).toBeNull();
    expect(checkCitationSideTripGate(goal, "search_knowledge", []).ok).toBe(true);
    expect(checkCitationSideTripGate(goal, "write_section", []).ok).toBe(true);
    expect(checkCitationSideTripGate(goal, "generate_outline", []).ok).toBe(true);
    // 跑了 validate（0 文献）仍不算起草完成，检索/写节依旧放行
    const afterValidate = [
      ok("validate_citations", { exportReady: false, gate: { refCount: 0, citationCount: 0 } }),
    ];
    expect(resolveApPipelineStep(goal, afterValidate)).toBeNull();
    expect(checkCitationSideTripGate(goal, "search_knowledge", afterValidate).ok).toBe(true);
    expect(checkCitationSideTripGate(goal, "write_section", afterValidate).ok).toBe(true);
  });

  it("review step completes with either run_review_rounds or review_content", () => {
    const goal = "按 academic-paper 流程继续：起草→引用检查→双语摘要→审查";
    const beforeReview = [
      ok("write_section", { persisted: true }),
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
    expect(shouldSkipPlanner("好", observations, "citation_apply")).toBe(true);
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
    const blocked = checkDraftSearchGate("写引言", "search_external", [], "draft");
    expect(blocked.ok).toBe(false);

    const afterInspect = checkDraftSearchGate("写引言", "search_knowledge", [
      ok("inspect_project"),
    ], "draft");
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

  it("nudges academic-paper citation_fix step after drafting + validate with issues", () => {
    const observations = [
      ok("write_section", { persisted: true }),
      ok("validate_citations", { exportReady: false }),
    ];
    expect(pickIntentNudge(ctx({ goal: AP_GOAL, observations }))).toContain(
      "refine_content",
    );
  });

  it("does not nudge citation_check before drafting; nudges after drafting begins", () => {
    expect(pickIntentNudge(ctx({ goal: AP_GOAL }))).toBeNull();
    expect(
      pickIntentNudge(
        ctx({ goal: AP_GOAL, observations: [ok("write_section", { persisted: true })] }),
      ),
    ).toContain("validate_citations");
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
    expect(
      pickIntentNudge(ctx({ goal: "A", intentKind: "draft", refTotal: 5 })),
    ).toContain("write_section");
  });

  it("prioritizes review_write over nothing when refs enough but body missing", () => {
    const c = ctx({ goal: "写一篇生物炭综述", refTotal: 30, importTarget: 30 });
    expect(pickIntentNudge(c)).toContain("subsectionTitle");
    expect(pickIntentNudge(c)).toContain("literature_body");
    expect(pickIntentStopAsk(c)).toContain("综述正文尚未写回");
  });

  it("nudge order and stop-ask order diverge for AP pipeline + literature", () => {
    // 同一组合 goal：引用修正未写回（pipeline_fix）+ 文献未足（literature）同时成立。
    // NUDGE_ORDER 先 AP 流程 → nudge 应提 refine_content；
    // STOP_ORDER 先文献 → stopAsk 应优先问文献体量。
    const observations = [
      ok("write_section", { persisted: true }),
      ok("validate_citations", { exportReady: false }),
    ];
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

describe("checkClassificationRetrieveGate（分类编码防反复检索）", () => {
  const cls = "先做文献分类编码";
  it("list_references ≥1 次且未保存 → 拦下", () => {
    const g = checkClassificationRetrieveGate(cls, "list_references", [
      ok("list_references"),
    ]);
    expect(g.ok).toBe(false);
    expect(g.error).toMatch(/save_reference_classification/);
  });

  it("read_reference 在分类模式被拦（禁止逐个读文献）", () => {
    const g = checkClassificationRetrieveGate(cls, "read_reference", []);
    expect(g.ok).toBe(false);
    expect(g.error).toMatch(/禁止逐个/);
  });

  it("已保存分类后放行 list_references", () => {
    const g = checkClassificationRetrieveGate(cls, "list_references", [
      ok("list_references"),
      ok("save_reference_classification"),
    ]);
    expect(g.ok).toBe(true);
  });

  it("非分类目标不受影响", () => {
    expect(
      checkClassificationRetrieveGate("写引言", "list_references", [
        ok("list_references"),
        ok("list_references"),
      ]).ok,
    ).toBe(true);
  });
});
