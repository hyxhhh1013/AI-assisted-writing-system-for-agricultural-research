import { describe, expect, it } from "vitest";
import { resolveAgentPhase } from "@/lib/agent/core/agent-phase";
import { checkAgentToolPhaseGate } from "@/lib/agent/core/phase-gates";
import {
  formatEntryRouteBrief,
  openingWorkbenchTab,
  resolveEntryRoutePhase,
} from "@/lib/agent/entry-route";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

function snap(overrides: Partial<AgentProjectSnapshot> = {}): AgentProjectSnapshot {
  return {
    title: "生物炭",
    mode: "research",
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

const OUTLINE = "一、引言\n二、方法\n三、结果\n四、讨论\n五、结论";

describe("resolveEntryRoutePhase", () => {
  it("从零推进不改原下一步", () => {
    expect(resolveEntryRoutePhase({
      entryMode: "full",
      paperMode: "research",
      hasOutline: false,
      hasWritingBlueprint: false,
      referenceCount: 0,
      claimCount: 0,
      currentPhase: 1,
      sectionChars: {},
      writeEnabled: true,
    })).toBeNull();
    const state = resolveAgentPhase({
      snapshot: snap({ agentEntryMode: "full" }),
      writeEnabled: true,
    });
    expect(state.nextAction).toBe("按本题检索并导入相关文献");
    expect(formatEntryRouteBrief("full", "research")).toContain("结果章没有证据声明就停");
  });

  it("已有大纲：空提纲先贴，不检索", () => {
    const state = resolveAgentPhase({
      snapshot: snap({ agentEntryMode: "outline_ready", mode: "review" }),
      writeEnabled: true,
    });
    expect(state.nextAction).toContain("贴进论证提纲");
    expect(state.phase).toBe("outline");
  });

  it("已有大纲：有提纲无蓝图时沿用标题出蓝图", () => {
    const state = resolveAgentPhase({
      snapshot: snap({
        agentEntryMode: "outline_ready",
        outline: OUTLINE,
        references: ["[1] a"],
      }),
      writeEnabled: true,
    });
    expect(state.nextAction).toContain("不改一级标题");
  });

  it("已有大纲：有蓝图后按提纲顺序写引言", () => {
    const state = resolveAgentPhase({
      snapshot: snap({
        agentEntryMode: "outline_ready",
        outline: OUTLINE,
        hasWritingBlueprint: true,
        sectionFills: [],
      }),
      writeEnabled: true,
    });
    expect(state).toMatchObject({
      phase: "draft",
      nextSectionKey: "introduction",
    });
  });

  it("已有数据：没有声明先入库", () => {
    const state = resolveAgentPhase({
      snapshot: snap({ agentEntryMode: "data_ready" }),
      writeEnabled: true,
    });
    expect(state.nextAction).toContain("证据声明");
    expect(openingWorkbenchTab({
      entryMode: "data_ready",
      outlineChars: 0,
      claimCount: 0,
      paperMode: "research",
    })).toBe("data");
  });

  it("已有数据：有声明后出对得上数据的大纲", () => {
    const state = resolveAgentPhase({
      snapshot: snap({
        agentEntryMode: "data_ready",
        dataClaims: [{ id: "D1" } as unknown as AgentProjectSnapshot["dataClaims"][number]],
      }),
      writeEnabled: true,
    });
    expect(state.nextAction).toContain("对得上证据声明");
  });

  it("Nature 模板：引言写完后先写结果，已有数据仍先写方法", () => {
    const nature = resolveAgentPhase({
      snapshot: snap({
        template: "nature",
        agentEntryMode: "outline_ready",
        outline: OUTLINE,
        hasWritingBlueprint: true,
        sectionFills: [
          { key: "introduction", chars: 2000 },
          { key: "methods", chars: 0 },
          { key: "results", chars: 0 },
        ],
      }),
      writeEnabled: true,
    });
    expect(nature.nextSectionKey).toBe("results");

    const dataReady = resolveAgentPhase({
      snapshot: snap({
        template: "nature",
        agentEntryMode: "data_ready",
        outline: OUTLINE,
        hasWritingBlueprint: true,
        currentPhase: 4,
        dataClaims: [{ id: "D1" } as unknown as AgentProjectSnapshot["dataClaims"][number]],
        sectionFills: [
          { key: "introduction", chars: 0 },
          { key: "methods", chars: 0 },
          { key: "results", chars: 0 },
        ],
      }),
      writeEnabled: true,
    });
    expect(dataReady.nextSectionKey).toBe("methods");
  });

  it("已有数据：有蓝图后先写方法，不写引言", () => {
    const state = resolveAgentPhase({
      snapshot: snap({
        agentEntryMode: "data_ready",
        outline: OUTLINE,
        hasWritingBlueprint: true,
        dataClaims: [{ id: "D1" } as unknown as AgentProjectSnapshot["dataClaims"][number]],
      }),
      writeEnabled: true,
    });
    expect(state.nextSectionKey).toBe("methods");
  });

  it("已有数据：方法和结果写完后才轮到引言", () => {
    const state = resolveAgentPhase({
      snapshot: snap({
        agentEntryMode: "data_ready",
        outline: OUTLINE,
        hasWritingBlueprint: true,
        dataClaims: [{ id: "D1" } as unknown as AgentProjectSnapshot["dataClaims"][number]],
        sectionFills: [
          { key: "methods", chars: 2000 },
          { key: "results", chars: 2000 },
        ],
      }),
      writeEnabled: true,
    });
    expect(state.nextSectionKey).toBe("discussion");
  });

  it("正文写完后进入引用，而不是停在起草", () => {
    const state = resolveAgentPhase({
      snapshot: snap({
        agentEntryMode: "outline_ready",
        mode: "review",
        outline: OUTLINE,
        hasWritingBlueprint: true,
        currentPhase: 4,
        sectionFills: [
          { key: "introduction", chars: 2000 },
          { key: "background", chars: 2000 },
          { key: "literature_body", chars: 3000 },
          { key: "conclusion", chars: 1200 },
        ],
      }),
      writeEnabled: true,
    });
    expect(state).toMatchObject({ phase: "citation", nextAction: "检查当前引用" });
  });
});

describe("entry route gates", () => {
  const ready = {
    outline: OUTLINE,
    hasWritingBlueprint: true,
    hasPaperConfig: true,
  };

  it("已有大纲时拦住 generate_outline，用户说重做则放行", () => {
    const project = snap({ ...ready, agentEntryMode: "outline_ready" });
    const blocked = checkAgentToolPhaseGate("generate_outline", {}, project, { userGoal: "继续" });
    expect(blocked.ok).toBe(false);
    const allowed = checkAgentToolPhaseGate("generate_outline", {}, project, { userGoal: "大纲重做一版" });
    expect(allowed.ok).toBe(true);
  });

  it("研究型没有证据声明时拦住结果章", () => {
    const project = snap({ ...ready, mode: "research", dataClaims: [] });
    const blocked = checkAgentToolPhaseGate("write_section", { section: "results" }, project);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("证据声明");
  });

  it("已有数据在方法结果未写时拦住引言", () => {
    const project = snap({ ...ready, agentEntryMode: "data_ready", mode: "research" });
    const blocked = checkAgentToolPhaseGate("write_section", { section: "introduction" }, project);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error).toContain("方法");
  });
});
