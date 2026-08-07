import { describe, expect, it } from "vitest";
import {
  isApFullStyleGoal,
  shouldPauseForConfigConfirm,
  shouldPauseForOutlineApprove,
  shouldPauseForBlueprintApprove,
  decisionMessage,
} from "@/lib/agent/core/checkpoints";

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

  it("requires config confirm when missing", () => {
    expect(
      shouldPauseForConfigConfirm({ hasPaperConfig: false, approvedKinds: [] }),
    ).toBe(true);
    expect(
      shouldPauseForConfigConfirm({
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
    ).toBe(true);
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
});
