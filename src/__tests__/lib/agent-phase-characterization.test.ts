import { describe, expect, it } from "vitest";
import { getPhaseTaskPack } from "@/contracts/phase-task-pack";
import {
  resolveAgentPhase,
  suggestNextAgentActions,
} from "@/lib/agent/core/agent-phase";
import { resolveAgentContinueHint } from "@/lib/agent/continue-hint";
import { resolvePhaseTaskPack } from "@/lib/agent/phase-task-pack";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

function snap(overrides: Partial<AgentProjectSnapshot> = {}): AgentProjectSnapshot {
  return {
    title: "生物炭",
    mode: "review",
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "热化学",
    outline: "",
    references: [],
    dataClaims: [],
    currentPhase: 1,
    hasWritingBlueprint: false,
    hasArgumentBlueprint: false,
    sectionFills: [],
    hasPaperConfig: true,
    ...overrides,
  };
}

const OUTLINE = "一、研究背景与引言\n二、研究现状\n三、结论";
const FULL: AgentProjectSnapshot["sectionFills"] = [
  { key: "introduction", chars: 2000 },
  { key: "background", chars: 2000 },
  { key: "literature_body", chars: 3000 },
  { key: "conclusion", chars: 1000 },
  { key: "abstract", chars: 400 },
  { key: "methods", chars: 2000 },
  { key: "results", chars: 2000 },
  { key: "discussion", chars: 2000 },
];

describe("resolveAgentPhase 锁住改前的下一步文案", () => {
  it("没项目时仍建议按本题检索", () => {
    const state = resolveAgentPhase({ snapshot: null, writeEnabled: true });
    expect(state.phase).toBe("literature");
    expect(state.nextAction).toBe("按本题检索并导入相关文献");
    expect(suggestNextAgentActions({
      writeEnabled: true,
      hasOutline: false,
      hasWritingBlueprint: false,
      emptySections: [],
    })).toEqual([state.nextAction]);
  });

  it.each(["review", "research"] as const)("%s 无文献无大纲 → 检索，不写引言", (mode) => {
    const project = snap({ mode, currentPhase: 1, outline: "", references: [] });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: true });
    expect(state).toMatchObject({
      phase: "literature",
      packPhase: 1,
      nextAction: "按本题检索并导入相关文献",
    });
    expect(state.phase).not.toBe("blueprint");
    expect(resolvePhaseTaskPack(project).goal).toBe(state.nextAction);
  });

  it("已有文献但没大纲 → 确认题目后出大纲，不再检索", () => {
    const project = snap({
      currentPhase: 1,
      references: ["[1] a", "[2] b", "[3] c"],
    });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: true });
    expect(state).toMatchObject({
      phase: "outline",
      packPhase: 2,
      subStep: "outline",
      nextAction: "确认论文题目后生成大纲与写作蓝图并写回项目",
    });
    expect(resolvePhaseTaskPack(project).goal).toBe(state.nextAction);
  });

  it("有大纲无蓝图 → outline 小步 blueprint，没有独立蓝图阶段", () => {
    const project = snap({
      currentPhase: 3,
      outline: OUTLINE,
      hasWritingBlueprint: false,
    });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: true });
    expect(state.phase).toBe("outline");
    expect(state.packPhase).toBe(3);
    expect(state.subStep).toBe("blueprint");
    expect(state.nextAction).toBe("基于大纲生成写作蓝图（含各节主张/证据）并写回项目");
    expect(resolvePhaseTaskPack(project).goal).toBe(state.nextAction);
  });

  it("大纲还没写 → 生成大纲与蓝图", () => {
    const project = snap({ currentPhase: 4, outline: "太短", references: ["[1] a"] });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: true });
    expect(state.nextAction).toBe("生成大纲与写作蓝图并写回项目");
    expect(state.phase).toBe("outline");
    expect(state.subStep).toBe("outline");
  });

  it("蓝图齐、引言空白 → 写引言，不带偏薄", () => {
    const project = snap({
      currentPhase: 4,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: [{ key: "introduction", chars: 0 }],
    });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: true });
    expect(state).toMatchObject({
      phase: "draft",
      packPhase: 4,
      nextSectionKey: "introduction",
      nextAction: "写引言并保存到当前项目",
    });
    expect(resolvePhaseTaskPack(project).goal).toBe(state.nextAction);
    const hint = resolveAgentContinueHint({
      suggestedActions: ["看看项目卡在哪，建议下一步", state.nextAction ?? ""],
      nextAction: state.nextAction,
      nextSectionKey: state.nextSectionKey,
    });
    expect(hint.goal).toBe(state.nextAction);
    expect(hint.title).toBe("撰写引言");
  });

  it("研究型引言空白也是写引言，不另起一套文案", () => {
    const project = snap({
      mode: "research",
      currentPhase: 4,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: [{ key: "introduction", chars: 0 }],
    });
    expect(resolveAgentPhase({ snapshot: project, writeEnabled: true }).nextAction)
      .toBe("写引言并保存到当前项目");
  });

  it("引言偏薄 → 带扩写提示", () => {
    const project = snap({
      currentPhase: 4,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: [{ key: "introduction", chars: 100 }],
    });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: true });
    expect(state.nextSectionKey).toBe("introduction");
    expect(state.nextAction).toBe("写引言并保存到当前项目（当前偏薄，建议扩写/补强）");
  });

  it("引言已够、研究现状还空 → 写研究现状", () => {
    const project = snap({
      currentPhase: 4,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: [
        { key: "introduction", chars: 2000 },
        { key: "background", chars: 0 },
        { key: "literature_body", chars: 0 },
      ],
    });
    expect(resolveAgentPhase({ snapshot: project, writeEnabled: true }).nextAction)
      .toBe("写研究现状并保存到当前项目");
  });

  it("护照已到审查阶段时，先审查，不改去写空白节", () => {
    const project = snap({
      currentPhase: 7,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: [{ key: "introduction", chars: 0 }],
    });
    expect(resolveAgentPhase({ snapshot: project, writeEnabled: true })).toMatchObject({
      phase: "review",
      packPhase: 7,
      nextAction: "运行下一轮论文审查",
    });
  });

  it("正文和摘要都够、阶段 6 → 双语摘要", () => {
    const project = snap({
      currentPhase: 6,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: FULL,
    });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: true });
    expect(state).toMatchObject({
      phase: "abstract",
      packPhase: 6,
      nextAction: "基于已写正文生成中英双语摘要并写回项目",
    });
    expect(resolvePhaseTaskPack(project).goal).toBe(state.nextAction);
    const hint = resolveAgentContinueHint({
      suggestedActions: [state.nextAction ?? ""],
      nextAction: state.nextAction,
    });
    expect(hint.goal).toBe("继续");
  });

  it("正文够了、阶段 5 → 检查引用", () => {
    const project = snap({
      currentPhase: 5,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: FULL,
    });
    expect(resolveAgentPhase({ snapshot: project, writeEnabled: true }).nextAction)
      .toBe("检查当前引用");
  });

  it("正文够了仍停在起草 → 看可配图数据", () => {
    const project = snap({
      currentPhase: 4,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: FULL,
    });
    expect(resolveAgentPhase({ snapshot: project, writeEnabled: true }).nextAction)
      .toBe("查看可配图数据并生成图表");
  });

  it("写作开关关掉时不再推写节", () => {
    const project = snap({
      currentPhase: 4,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: [{ key: "introduction", chars: 0 }],
    });
    const state = resolveAgentPhase({ snapshot: project, writeEnabled: false });
    expect(state.nextAction).toBeNull();
    expect(suggestNextAgentActions({
      currentPhase: 4,
      writeEnabled: false,
      hasOutline: true,
      hasWritingBlueprint: true,
      emptySections: ["introduction"],
      nextSectionKey: "introduction",
    })).toEqual([]);
  });

  it("阶段包在没有主建议时退回包里的原目标", () => {
    const project = snap({
      currentPhase: 4,
      outline: OUTLINE,
      hasWritingBlueprint: true,
      sectionFills: [{ key: "introduction", chars: 0 }],
    });
    const pack = getPhaseTaskPack(4);
    const resolved = resolvePhaseTaskPack(project);
    expect(resolved.goal).not.toBe(pack.goal);
    expect(resolved.goal).toContain("引言");
  });
});
