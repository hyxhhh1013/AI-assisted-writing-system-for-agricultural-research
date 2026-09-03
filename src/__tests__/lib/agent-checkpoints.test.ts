import { describe, expect, it } from "vitest";
import {
  isApFullStyleGoal,
  shouldPauseForConfigConfirm,
  shouldPauseForOutlineApprove,
  shouldPauseForBlueprintApprove,
  decisionMessage,
  revokeApprovedKind,
  buildOutlineCheckpoint,
  buildBlueprintCheckpoint,
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

  it("pauses after persisted generate_outline even for ordinary goals", () => {
    expect(
      shouldPauseForOutlineApprove({
        goal: "生成大纲",
        toolName: "generate_outline",
        toolSuccess: true,
        persisted: true,
        approvedKinds: [],
      }),
    ).toBe(true);
  });

  it("pauses again when a new outline is persisted after prior approval", () => {
    expect(
      shouldPauseForOutlineApprove({
        goal: "按 academic-paper 写完整篇",
        toolName: "generate_outline",
        toolSuccess: true,
        persisted: true,
        approvedKinds: ["outline_approve"],
      }),
    ).toBe(true);
  });

  it("does not pause when outline was only previewed", () => {
    expect(
      shouldPauseForOutlineApprove({
        goal: "生成大纲",
        toolName: "generate_outline",
        toolSuccess: true,
        persisted: false,
        approvedKinds: [],
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
        goal: "nonsense",
        intentKind: "draft",
        hasPaperConfig: false,
        approvedKinds: [],
      }),
    ).toBe(true);
    expect(
      shouldPauseForConfigConfirm({
        goal: "帮我写引言",
        intentKind: "literature",
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

  it("keeps a readable outline in the checkpoint instead of clipping at 2000", () => {
    const body = "## 引言\n".repeat(400);
    const cp = buildOutlineCheckpoint(body);
    expect(cp.preview?.length ?? 0).toBeGreaterThan(2000);
    expect(cp.message).toContain("写作停在你这里");
  });

  it("keeps a readable blueprint preview instead of clipping at 2000", () => {
    const body = "主张：生物炭改良盐碱地。\n".repeat(300);
    const cp = buildBlueprintCheckpoint(body);
    expect(cp.preview?.length ?? 0).toBeGreaterThan(2000);
    expect(cp.message).toContain("过目主张");
  });

  it("revokes outline approval after a new persist", () => {
    expect(
      revokeApprovedKind(["outline_approve", "blueprint_approve"], "outline_approve"),
    ).toEqual(["blueprint_approve"]);
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
