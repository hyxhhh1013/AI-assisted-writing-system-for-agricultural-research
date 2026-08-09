import { describe, expect, it } from "vitest";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import {
  applyBlueprintSectionHintForKey,
  buildAgentWritingGlobalContext,
  collectBlueprintAssignedSourceTokens,
  formatBlueprintSectionHintForKey,
  listBlueprintSubsectionPathsForKey,
  prepareAgentWriteBlueprintContext,
  resolveAssignedSourcesToSelectedIds,
  resolveBlueprintSectionPathForKey,
} from "@/lib/agent/blueprint-write-context";
import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";

const sampleBlueprint: WritingBlueprint = {
  version: 1,
  narrativeSummary: "从背景到进展再到展望。",
  thesis: "生物炭可提升盐碱地作物产量。",
  estimatedWordCount: { min: 8000, max: 10000 },
  figurePlan: {
    totalMin: 2,
    totalMax: 4,
    items: [
      {
        id: "fig-1",
        sectionPath: "研究进展综述",
        type: "table",
        purpose: "催化剂对比",
        suggestedCaption: "表1 催化剂对比",
        priority: "required",
      },
    ],
  },
  sectionGuides: [
    {
      sectionPath: "引言",
      purpose: "提出科学问题",
      keyPoints: ["盐碱地现状", "生物炭机遇"],
    },
    {
      sectionPath: "研究进展综述 > 改性策略",
      purpose: "综述改性路径",
      keyPoints: ["酸改性", "金属盐改性"],
    },
    {
      sectionPath: "研究进展综述 > 应用效果",
      purpose: "归纳田间效果",
      keyPoints: ["产量", "土壤指标"],
      assignedSources: ["[2]", "field-trial.pdf"],
    },
  ],
  writingOrder: ["引言", "研究进展综述", "结论与展望"],
  prerequisites: [],
  generatedAt: 1,
};

function baseSnapshot(
  overrides: Partial<AgentProjectSnapshot> = {},
): AgentProjectSnapshot {
  return {
    title: "测试论文",
    mode: "review",
    language: "zh",
    template: "sci",
    citationStyle: "gbt7714",
    researchDirection: "soil",
    outline: "## 1 引言\n## 2 研究进展综述\n### 2.1 改性策略\n## 3 结论与展望\n",
    references: [],
    dataClaims: [],
    globalContext: {
      outline: "## 1 引言\n",
      blueprint: sampleBlueprint,
    },
    currentPhase: 4,
    hasWritingBlueprint: true,
    hasArgumentBlueprint: false,
    hasPaperConfig: true,
    sectionFills: [
      { key: "introduction", chars: 0 },
      { key: "literature_body", chars: 120, preview: "已有一段综述正文预览" },
    ],
    ...overrides,
  };
}

describe("resolveBlueprintSectionPathForKey", () => {
  it("maps English section key via outline top path", () => {
    const path = resolveBlueprintSectionPathForKey(
      "literature_body",
      "## 1 引言\n## 2 研究进展综述\n### 2.1 改性策略\n",
      "review",
      sampleBlueprint,
      "zh",
    );
    expect(path).toBe("研究进展综述");
  });

  it("falls back to blueprint guides when outline empty", () => {
    const path = resolveBlueprintSectionPathForKey(
      "introduction",
      "",
      "review",
      sampleBlueprint,
      "zh",
    );
    expect(path).toBe("引言");
  });
});

describe("listBlueprintSubsectionPathsForKey", () => {
  it("returns nested literature_body paths when ≥2", () => {
    const paths = listBlueprintSubsectionPathsForKey(
      sampleBlueprint,
      "literature_body",
      "review",
    );
    expect(paths.length).toBeGreaterThanOrEqual(2);
    expect(paths.every((p) => p.includes("研究进展综述"))).toBe(true);
    expect(paths.some((p) => p.includes("改性策略"))).toBe(true);
  });

  it("returns empty when blueprint missing", () => {
    expect(listBlueprintSubsectionPathsForKey(null, "literature_body", "review")).toEqual(
      [],
    );
  });
});

describe("formatBlueprintSectionHintForKey", () => {
  it("aggregates nested guides under literature_body", () => {
    const hint = formatBlueprintSectionHintForKey(
      sampleBlueprint,
      "literature_body",
      "review",
      "研究进展综述",
    );
    expect(hint).toContain("改性策略");
    expect(hint).toContain("金属盐改性");
    expect(hint).toContain("表1 催化剂对比");
  });
});

describe("prepareAgentWriteBlueprintContext", () => {
  it("nests blueprint and injects section hint into draftContext", () => {
    const { globalContext, draftContext } = prepareAgentWriteBlueprintContext({
      project: baseSnapshot(),
      sectionKey: "literature_body",
      draftContext: "请按主题展开综述。",
    });

    expect(globalContext.blueprint?.thesis).toContain("生物炭");
    expect(globalContext.outline).toContain("研究进展综述");
    expect(draftContext).toContain("写作蓝图（本节）");
    expect(draftContext).toContain("酸改性");
    expect(draftContext).toContain("请按主题展开综述");
  });

  it("prefers subsection guide when subsectionTitle matches", () => {
    const { draftContext } = prepareAgentWriteBlueprintContext({
      project: baseSnapshot(),
      sectionKey: "literature_body",
      draftContext: "写改性",
      subsectionTitle: "改性策略",
    });
    expect(draftContext).toContain("综述改性路径");
    expect(draftContext).toContain("酸改性");
  });

  it("maps assignedSources to selectedSourceIds including [n] → sourceName", () => {
    const { selectedSourceIds, draftContext } = prepareAgentWriteBlueprintContext({
      project: baseSnapshot({
        referenceSourceNames: [
          { refIndex: 1, sourceName: "intro.pdf" },
          { refIndex: 2, sourceName: "yield.pdf" },
        ],
        globalContext: {
          outline: "## 1 引言\n",
          blueprint: sampleBlueprint,
          analysisResults: ["产量随生物炭用量增加而提升"],
        },
      }),
      sectionKey: "literature_body",
      draftContext: "写应用",
      subsectionTitle: "应用效果",
    });
    expect(selectedSourceIds?.sort()).toEqual(["field-trial.pdf", "yield.pdf"].sort());
    expect(draftContext).toContain("优先文献源");
  });
});

describe("resolveAssignedSourcesToSelectedIds", () => {
  it("returns undefined when tokens empty or unresolved nums", () => {
    expect(resolveAssignedSourcesToSelectedIds([])).toBeUndefined();
    expect(resolveAssignedSourcesToSelectedIds(["[9]"], [])).toBeUndefined();
  });

  it("passes through filenames", () => {
    expect(resolveAssignedSourcesToSelectedIds(["a.pdf", "b.pdf"])).toEqual([
      "a.pdf",
      "b.pdf",
    ]);
  });
});

describe("collectBlueprintAssignedSourceTokens", () => {
  it("collects from matching section guides", () => {
    const tokens = collectBlueprintAssignedSourceTokens({
      blueprint: sampleBlueprint,
      sectionKey: "literature_body",
      mode: "review",
      subsectionTitle: "应用效果",
    });
    expect(tokens).toEqual(["[2]", "field-trial.pdf"]);
  });
});

describe("buildAgentWritingGlobalContext", () => {
  it("does not treat blueprint root fields as WritingGlobalContext", () => {
    const gc = buildAgentWritingGlobalContext(baseSnapshot());
    expect(gc.blueprint?.version).toBe(1);
    expect((gc as { thesis?: string }).thesis).toBeUndefined();
    expect(gc.sectionPreviews?.literature_body).toContain("综述正文");
  });

  it("forwards analysisResults into Writer globalContext", () => {
    const gc = buildAgentWritingGlobalContext(
      baseSnapshot({
        globalContext: {
          blueprint: sampleBlueprint,
          analysisResults: ["XRD 峰位对应蒙脱石晶相"],
        },
      }),
    );
    expect(gc.analysisResults?.[0]).toContain("蒙脱石");
  });
});

describe("applyBlueprintSectionHintForKey", () => {
  it("replaces stale hint", () => {
    const stale = `说明\n【写作蓝图（本节）】\n- 本节目的：旧目的\n`;
    const next = applyBlueprintSectionHintForKey(
      stale,
      sampleBlueprint,
      "introduction",
      "review",
      "引言",
    );
    expect(next).not.toContain("旧目的");
    expect(next).toContain("提出科学问题");
  });
});
