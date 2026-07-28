import { describe, expect, it } from "vitest";
import {
  checkDiagnoseInspectGate,
  checkDraftSearchGate,
  isDiagnoseStyleGoal,
  isReviewWritingGoal,
  isSectionDraftGoal,
  parseLiteratureImportTarget,
} from "@/lib/agent/core/goal-intents";

describe("goal-intents", () => {
  it("detects diagnose and draft goals", () => {
    expect(isDiagnoseStyleGoal("看看项目现在卡在哪，建议下一步")).toBe(true);
    expect(isSectionDraftGoal("写引言")).toBe(true);
    expect(isSectionDraftGoal("检索并导入 1 篇文献")).toBe(false);
    expect(isReviewWritingGoal("写一篇生物炭综述")).toBe(true);
  });

  it("parses literature import target count", () => {
    expect(parseLiteratureImportTarget("检索并导入文献")).toBe(30);
    expect(parseLiteratureImportTarget("写生物炭土壤改良综述")).toBe(30);
    expect(parseLiteratureImportTarget("导入 5 篇相关文献")).toBe(5);
    expect(parseLiteratureImportTarget("至少 40 篇文献")).toBe(40);
    expect(parseLiteratureImportTarget("搜一篇生物炭论文")).toBe(1);
    expect(parseLiteratureImportTarget("找几篇热解相关文献")).toBe(30);
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
      ["[inspect_project] 缺大纲"],
    );
    expect(after.ok).toBe(true);
  });

  it("draft blocks search even after context read", () => {
    const blocked = checkDraftSearchGate("写引言", "search_external", []);
    expect(blocked.ok).toBe(false);

    const afterInspect = checkDraftSearchGate("写引言", "search_knowledge", [
      "[inspect_project] 已有大纲与文献",
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
