import { describe, expect, it } from "vitest";
import {
  checkCitationCheckGate,
  checkCitationSideTripGate,
  checkDiagnoseInspectGate,
  checkDraftSearchGate,
  citationCheckReportReady,
  hasCitationRefineSuccess,
  isAcademicPaperPipelineGoal,
  isCitationApplyGoal,
  isCitationCheckGoal,
  isDiagnoseStyleGoal,
  isReviewWritingGoal,
  isSectionDraftGoal,
  parseLiteratureImportTarget,
  resolveApPipelineStep,
  shouldSkipPlanner,
} from "@/lib/agent/core/goal-intents";
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
    const afterValidate = [ok("validate_citations")];
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

  it("detects citation apply after validate report", () => {
    const observations = [ok("validate_citations")];
    expect(isCitationApplyGoal("好", observations)).toBe(true);
    expect(isCitationApplyGoal("好", [])).toBe(false);
    expect(shouldSkipPlanner("好", observations)).toBe(true);
    expect(citationCheckReportReady(observations)).toBe(true);
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
    const observations = [ok("validate_citations")];
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
