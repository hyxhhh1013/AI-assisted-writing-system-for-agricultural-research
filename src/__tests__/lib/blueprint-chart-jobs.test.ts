import { describe, expect, it } from "vitest";
import type { ChartConfig } from "@/contracts/data-source";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import {
  boundChartJobToFigureConfig,
  buildGenerateChartCallsFromJobs,
  buildNarrativeFigureCalls,
  collectBoundChartJobsForSection,
  narrativeTablesAwaitingRows,
  formatUnboundBlueprintChartsNudge,
  jobAlreadyCoveredByText,
} from "@/lib/blueprint-chart-jobs";

const configs: ChartConfig[] = [
  {
    type: "bar",
    title: "产量对比",
    xLabel: "处理",
    yLabel: "产量",
    labels: ["CK", "A", "B"],
    datasets: [{ label: "产量", data: [10, 12, 15] }],
  },
  {
    type: "line",
    title: "叶绿素",
    labels: ["1d", "3d"],
    datasets: [{ label: "Chl", data: [1.1, 1.4] }],
  },
];

const blueprint: WritingBlueprint = {
  version: 1,
  narrativeSummary: "n",
  thesis: "t",
  estimatedWordCount: { min: 1, max: 2 },
  figurePlan: {
    totalMin: 1,
    totalMax: 2,
    items: [
      {
        id: "fig-flow",
        sectionPath: "材料与方法",
        type: "flow",
        purpose: "流程",
        suggestedCaption: "图1 流程",
        priority: "required",
      },
      {
        id: "fig-yield",
        sectionPath: "结果与分析 > 产量",
        type: "chart",
        purpose: "产量对比",
        suggestedCaption: "图2 产量对比",
        priority: "required",
        dataBinding: { kind: "chartConfig", chartConfigIndex: 0 },
      },
      {
        id: "fig-miss",
        sectionPath: "结果与分析",
        type: "chart",
        purpose: "缺数据",
        suggestedCaption: "图3 未绑定",
        priority: "required",
      },
    ],
  },
  sectionGuides: [],
  writingOrder: [],
  prerequisites: [],
  generatedAt: 1,
};

describe("collectBoundChartJobsForSection", () => {
  it("maps bound chart items on the written section to plot-source indexes", () => {
    const { jobs, unboundRequired } = collectBoundChartJobsForSection({
      blueprint,
      sectionKey: "results",
      mode: "research",
      chartConfigs: configs,
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.chartIndex).toBe(0);
    expect(jobs[0]?.caption).toBe("图2 产量对比");
    expect(unboundRequired.some((i) => i.id === "fig-miss")).toBe(true);
  });

  it("narrows to subsection path", () => {
    const { jobs } = collectBoundChartJobsForSection({
      blueprint,
      sectionKey: "results",
      mode: "research",
      subsectionTitle: "产量",
      chartConfigs: configs,
    });
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.figurePlanId).toBe("fig-yield");
  });

  it("emits one job per explicit binding on the same figure", () => {
    const multi: WritingBlueprint = {
      ...blueprint,
      figurePlan: {
        ...blueprint.figurePlan,
        items: [
          {
            id: "fig-pore",
            sectionPath: "结果与分析 > 孔结构",
            type: "chart",
            purpose: "孔结构标量",
            suggestedCaption: "图4 孔结构",
            priority: "required",
            dataBindings: [
              { kind: "chartConfig", chartConfigIndex: 0 },
              { kind: "chartConfig", chartConfigIndex: 1 },
            ],
            dataGap: "BET 曲线还没上传",
          },
        ],
      },
    };
    const { jobs, unboundRequired } = collectBoundChartJobsForSection({
      blueprint: multi,
      sectionKey: "results",
      mode: "research",
      subsectionTitle: "孔结构",
      chartConfigs: configs,
    });
    expect(jobs.map((job) => job.chartIndex)).toEqual([0, 1]);
    expect(unboundRequired).toHaveLength(0);
  });

  it("skips flow/schematic (need draft_mechanism_figure)", () => {
    const { jobs } = collectBoundChartJobsForSection({
      blueprint,
      sectionKey: "methods",
      mode: "research",
      chartConfigs: configs,
    });
    expect(jobs).toHaveLength(0);
  });
});

describe("buildNarrativeFigureCalls", () => {
  it("does not queue a flow figure while writing methods", () => {
    const calls = buildNarrativeFigureCalls({
      blueprint,
      sectionKey: "methods",
      mode: "research",
      draft: "",
      alreadyQueued: [],
    });
    expect(calls).toHaveLength(0);
  });

  it("skips a figure whose caption is already in the draft", () => {
    const calls = buildNarrativeFigureCalls({
      blueprint,
      sectionKey: "methods",
      mode: "research",
      draft: "见图 图1 流程",
      alreadyQueued: [],
    });
    expect(calls).toHaveLength(0);
  });

  it("does not turn key points into a chopped 要点/说明 table", () => {
    const withTable: WritingBlueprint = {
      ...blueprint,
      sectionGuides: [
        {
          sectionPath: "研究现状与问题",
          purpose: "框架",
          keyPoints: [
            "概念与框架：材料性能各层级（分子结构—晶体与颗粒—配方与界面—器件）与燃放各阶段的对应关系",
          ],
        },
      ],
      figurePlan: {
        ...blueprint.figurePlan,
        items: [
          ...blueprint.figurePlan.items,
          {
            id: "tbl-1",
            sectionPath: "研究现状与问题",
            type: "table",
            purpose: "对应关系",
            suggestedCaption: "表1 材料性能层级与燃放阶段的对应关系及研究覆盖现状",
            priority: "required",
          },
        ],
      },
    };
    const calls = buildNarrativeFigureCalls({
      blueprint: withTable,
      sectionKey: "background",
      mode: "review",
      subsectionTitle: "研究现状与问题",
      draft: "",
      alreadyQueued: [],
    });
    expect(calls).toHaveLength(0);
    expect(narrativeTablesAwaitingRows({
      blueprint: withTable,
      sectionKey: "background",
      mode: "review",
      subsectionTitle: "研究现状与问题",
      draft: "",
    })).toEqual(["表1 材料性能层级与燃放阶段的对应关系及研究覆盖现状"]);
  });
});

describe("buildGenerateChartCallsFromJobs", () => {
  it("queues generate_chart with sectionKey and skips already queued index", () => {
    const { jobs } = collectBoundChartJobsForSection({
      blueprint,
      sectionKey: "results",
      mode: "research",
      chartConfigs: configs,
    });
    const calls = buildGenerateChartCallsFromJobs(
      jobs,
      "results",
      [{ name: "generate_chart", args: { chartIndex: 0 } }],
    );
    expect(calls).toHaveLength(0);
    const fresh = buildGenerateChartCallsFromJobs(jobs, "results", []);
    expect(fresh).toHaveLength(1);
    expect(fresh[0]?.name).toBe("generate_chart");
    expect(fresh[0]?.args.chartIndex).toBe(0);
    expect(fresh[0]?.args.sectionKey).toBe("results");
  });
});

describe("boundChartJobToFigureConfig / coverage", () => {
  it("builds FIGURE-compatible chart config from stored labels/datasets", () => {
    const { jobs } = collectBoundChartJobsForSection({
      blueprint,
      sectionKey: "results",
      mode: "research",
      chartConfigs: configs,
    });
    const fig = boundChartJobToFigureConfig(jobs[0]!);
    expect(fig.tool).toBe("chart");
    expect((fig.config.data as { labels: string[] }).labels).toEqual(["CK", "A", "B"]);
    expect(jobAlreadyCoveredByText("![图2 产量对比](/api/charts/a.png)", jobs[0]!)).toBe(true);
    expect(jobAlreadyCoveredByText("如图2 产量对比所示，处理A更高。", jobs[0]!)).toBe(false);
  });
});

describe("formatUnboundBlueprintChartsNudge", () => {
  it("asks for upload when required charts have no data", () => {
    const { unboundRequired } = collectBoundChartJobsForSection({
      blueprint,
      sectionKey: "results",
      mode: "research",
      chartConfigs: configs,
    });
    const msg = formatUnboundBlueprintChartsNudge(unboundRequired);
    expect(msg).toMatch(/上传 CSV/);
    expect(msg).toMatch(/图3/);
  });
});
