import { describe, expect, it } from "vitest";
import {
  isApFullStyleGoal,
  shouldPauseForConfigConfirm,
  shouldPauseForOutlineApprove,
  shouldPauseForBlueprintApprove,
  decisionMessage,
} from "@/lib/agent/core/checkpoints";
import { applyEntryModeToGoal } from "@/lib/agent/entry-mode";

describe("agent checkpoints", () => {
  it("detects academic-paper full goals", () => {
    expect(isApFullStyleGoal("按 academic-paper 自主推进")).toBe(true);
    expect(isApFullStyleGoal("写引言并保存")).toBe(false);
  });

  it("pauses after generate_outline for full goals", () => {
    expect(
      shouldPauseForOutlineApprove({
        goal: "按 academic-paper 写完整篇",
        toolName: "generate_outline",
        toolSuccess: true,
        persisted: true,
        approvedKinds: [],
      }),
    ).toBe(true);
  });

  it("skips outline pause when already approved", () => {
    expect(
      shouldPauseForOutlineApprove({
        goal: "按 academic-paper 写完整篇",
        toolName: "generate_outline",
        toolSuccess: true,
        persisted: true,
        approvedKinds: ["outline_approve"],
      }),
    ).toBe(false);
  });

  it("requires config confirm only for writing/full goals when missing", () => {
    expect(
      shouldPauseForConfigConfirm({
        goal: "按 academic-paper 写完整篇",
        hasPaperConfig: false,
        approvedKinds: [],
      }),
    ).toBe(true);
    expect(
      shouldPauseForConfigConfirm({
        goal: "帮我写引言",
        hasPaperConfig: false,
        approvedKinds: [],
      }),
    ).toBe(true);
    // 与论文配置无关的目标不应被配置问答拦一道
    expect(
      shouldPauseForConfigConfirm({
        goal: "帮我检索几篇生物炭文献",
        hasPaperConfig: false,
        approvedKinds: [],
      }),
    ).toBe(false);
    expect(
      shouldPauseForConfigConfirm({
        goal: "帮我看看项目现状",
        hasPaperConfig: false,
        approvedKinds: [],
      }),
    ).toBe(false);
    expect(
      shouldPauseForConfigConfirm({
        goal: "按 academic-paper 写完整篇",
        hasPaperConfig: false,
        approvedKinds: ["config_confirm"],
      }),
    ).toBe(false);
  });

  it("builds decision messages", () => {
    expect(decisionMessage("outline_approve", "approve")).toContain("已批准大纲");
    expect(decisionMessage("outline_approve", "revise", "加方法节")).toContain("加方法节");
  });

  it("pauses after blueprint generation for full goals", () => {
    expect(
      shouldPauseForBlueprintApprove({
        goal: "按 academic-paper 写完整篇",
        toolName: "generate_writing_blueprint",
        toolSuccess: true,
        persisted: true,
        approvedKinds: [],
      }),
    ).toBe(true);
    expect(
      shouldPauseForBlueprintApprove({
        goal: "按 academic-paper 写完整篇",
        toolName: "build_argument_blueprint",
        toolSuccess: true,
        persisted: true,
        approvedKinds: [],
      }),
    ).toBe(false);
  });

  it("skips blueprint pause for non-full goals / non-blueprint tools / already approved", () => {
    expect(
      shouldPauseForBlueprintApprove({
        goal: "写引言并保存",
        toolName: "generate_writing_blueprint",
        toolSuccess: true,
        persisted: true,
        approvedKinds: [],
      }),
    ).toBe(false);
    expect(
      shouldPauseForBlueprintApprove({
        goal: "按 academic-paper 写完整篇",
        toolName: "generate_outline",
        toolSuccess: true,
        persisted: true,
        approvedKinds: [],
      }),
    ).toBe(false);
    expect(
      shouldPauseForBlueprintApprove({
        goal: "按 academic-paper 写完整篇",
        toolName: "generate_writing_blueprint",
        toolSuccess: true,
        persisted: true,
        approvedKinds: ["blueprint_approve"],
      }),
    ).toBe(false);
  });

  it("builds blueprint decision messages", () => {
    expect(decisionMessage("blueprint_approve", "approve")).toContain("已批准写作蓝图");
    expect(decisionMessage("blueprint_approve", "revise", "加图表")).toContain("加图表");
  });

  it("entryMode=full 前缀 goal 触发蓝图确认", () => {
    const goal = applyEntryModeToGoal("看看蓝图", "full");
    expect(isApFullStyleGoal(goal)).toBe(true);
    expect(
      shouldPauseForBlueprintApprove({
        goal,
        toolName: "generate_writing_blueprint",
        toolSuccess: true,
        persisted: true,
        approvedKinds: [],
      }),
    ).toBe(true);
  });
});
