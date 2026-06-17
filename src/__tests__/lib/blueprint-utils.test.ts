import { describe, it, expect } from "vitest";
import {
  countFiguresForSection,
  figureBelongsToSection,
  formatBlueprintSectionHint,
  formatBlueprintGlobalSummary,
  stripBlueprintSectionHint,
  applyBlueprintSectionHintToContext,
  computeOutlineHash,
  isBlueprintStale,
  blueprintFigureToPlotHref,
  resolveChartConfigIndex,
  enrichBlueprintChartBindingsFromCatalog,
} from "@/lib/blueprint-utils";
import type { ChartConfig } from "@/contracts/data-source";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import { parseWritingBlueprint, serializeWritingBlueprint } from "@/contracts/writing-blueprint";

const sampleBlueprint: WritingBlueprint = {
  version: 1,
  narrativeSummary: "从背景到机理再到应用。",
  thesis: "生物炭可提升盐碱地作物产量。",
  estimatedWordCount: { min: 8000, max: 10000 },
  figurePlan: {
    totalMin: 4,
    totalMax: 6,
    items: [
      {
        id: "fig-1",
        sectionPath: "材料与方法",
        type: "flow",
        purpose: "试验流程",
        suggestedCaption: "图1 试验流程",
        priority: "required",
      },
      {
        id: "fig-2",
        sectionPath: "结果与分析 > 产量",
        type: "chart",
        purpose: "产量对比",
        suggestedCaption: "图2 产量对比",
        priority: "required",
      },
    ],
  },
  sectionGuides: [
    {
      sectionPath: "材料与方法",
      purpose: "说明试验设计",
      keyPoints: ["材料来源", "指标测定"],
    },
  ],
  writingOrder: ["材料与方法", "结果与分析"],
  prerequisites: ["需备齐产量数据"],
  generatedAt: 1,
};

describe("figureBelongsToSection", () => {
  it("matches exact path and descendants", () => {
    expect(figureBelongsToSection("材料与方法", "材料与方法")).toBe(true);
    expect(figureBelongsToSection("结果与分析 > 产量", "结果与分析")).toBe(true);
    expect(figureBelongsToSection("引言", "材料与方法")).toBe(false);
  });
});

describe("countFiguresForSection", () => {
  it("counts items under section subtree", () => {
    expect(countFiguresForSection("材料与方法", sampleBlueprint.figurePlan.items)).toBe(1);
    expect(countFiguresForSection("结果与分析", sampleBlueprint.figurePlan.items)).toBe(1);
    expect(countFiguresForSection("引言", sampleBlueprint.figurePlan.items)).toBe(0);
  });
});

describe("formatBlueprintSectionHint", () => {
  it("includes guide and figures for section", () => {
    const hint = formatBlueprintSectionHint(sampleBlueprint, "材料与方法");
    expect(hint).toContain("写作蓝图");
    expect(hint).toContain("试验流程");
  });

  it("returns empty when no match", () => {
    expect(formatBlueprintSectionHint(sampleBlueprint, "摘要")).toBe("");
  });
});

describe("formatBlueprintGlobalSummary", () => {
  it("includes thesis and figure totals", () => {
    const summary = formatBlueprintGlobalSummary(sampleBlueprint);
    expect(summary).toContain("生物炭");
    expect(summary).toContain("4–6 张");
  });
});

describe("applyBlueprintSectionHintToContext", () => {
  it("replaces stale section hint with saved blueprint", () => {
    const stale = `【扩写目标】材料与方法
【写作蓝图（本节）】
- 本节目的：旧目的`;
    const next = applyBlueprintSectionHintToContext(stale, sampleBlueprint, "材料与方法");
    expect(next).not.toContain("旧目的");
    expect(next).toContain("说明试验设计");
    expect(next).toContain("试验流程");
  });
});

describe("stripBlueprintSectionHint", () => {
  it("removes blueprint block from context", () => {
    const ctx = "前文\n【写作蓝图（本节）】\n- 要点";
    expect(stripBlueprintSectionHint(ctx)).toBe("前文");
  });
});

describe("parseWritingBlueprint", () => {
  it("round-trips valid blueprint", () => {
    const raw = serializeWritingBlueprint(sampleBlueprint);
    const parsed = parseWritingBlueprint(raw);
    expect(parsed?.thesis).toBe(sampleBlueprint.thesis);
    expect(parsed?.figurePlan.items).toHaveLength(2);
  });

  it("returns null for invalid json", () => {
    expect(parseWritingBlueprint("{")).toBeNull();
    expect(parseWritingBlueprint(undefined)).toBeNull();
  });
});

describe("computeOutlineHash / isBlueprintStale", () => {
  it("detects outline changes", () => {
    const hash = computeOutlineHash("# 引言\n内容");
    const bp: WritingBlueprint = { ...sampleBlueprint, outlineHash: hash };
    expect(isBlueprintStale(bp, "# 引言\n内容")).toBe(false);
    expect(isBlueprintStale(bp, "# 引言\n已修改")).toBe(true);
  });

  it("treats missing outlineHash as not stale", () => {
    expect(isBlueprintStale(sampleBlueprint, "任意大纲")).toBe(false);
  });
});

describe("blueprintFigureToPlotHref", () => {
  const sampleChartConfigs: ChartConfig[] = [
    {
      type: "bar",
      title: "各处理产量对比",
      yLabel: "产量",
      labels: ["CK", "T1", "T2"],
      datasets: [{ label: "产量", data: [10, 12, 15] }],
    },
  ];

  it("builds plot link for chart and flow types", () => {
    const chartHref = blueprintFigureToPlotHref("p1", sampleBlueprint.figurePlan.items[1]);
    expect(chartHref).toContain("/plot?");
    expect(chartHref).toContain("id=p1");

    const flowHref = blueprintFigureToPlotHref("p1", sampleBlueprint.figurePlan.items[0]);
    expect(flowHref).toContain("figure=flow");
  });

  it("uses chartIdx when project chartConfigs are bound", () => {
    const item = {
      ...sampleBlueprint.figurePlan.items[1],
      dataBinding: {
        kind: "chartConfig" as const,
        chartConfigIndex: 0,
        chartTitle: "各处理产量对比",
        variable: "产量",
      },
    };
    const href = blueprintFigureToPlotHref("p1", item, sampleChartConfigs);
    expect(href).toContain("chartIdx=0");
    expect(href).not.toContain("figureSpec=");
  });
});

describe("resolveChartConfigIndex", () => {
  const configs: ChartConfig[] = [
    {
      type: "bar",
      title: "各处理pH对比",
      yLabel: "pH",
      labels: ["A", "B"],
      datasets: [{ label: "pH", data: [1, 2] }],
    },
    {
      type: "bar",
      title: "各处理产量对比",
      yLabel: "产量",
      labels: ["A", "B"],
      datasets: [{ label: "产量", data: [3, 4] }],
    },
  ];

  it("matches by dataBinding index and caption keywords", () => {
    const byIndex = resolveChartConfigIndex(
      {
        ...sampleBlueprint.figurePlan.items[1],
        dataBinding: { kind: "chartConfig", chartConfigIndex: 1 },
      },
      configs,
    );
    expect(byIndex).toBe(1);

    const byCaption = resolveChartConfigIndex(sampleBlueprint.figurePlan.items[1], configs);
    expect(byCaption).toBe(1);
  });
});

describe("enrichBlueprintChartBindingsFromCatalog", () => {
  it("auto-binds chart items to catalog entries", () => {
    const enriched = enrichBlueprintChartBindingsFromCatalog(sampleBlueprint, [
      { index: 0, title: "各处理产量对比", sourceFileName: "data.xlsx", variable: "产量" },
    ]);
    const chartItem = enriched.figurePlan.items.find((i) => i.type === "chart");
    expect(chartItem?.dataBinding?.chartConfigIndex).toBe(0);
  });
});
