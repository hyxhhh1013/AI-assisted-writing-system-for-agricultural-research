import { describe, expect, it } from "vitest";
import type { ChartConfig } from "@/contracts/data-source";
import type { WritingBlueprint } from "@/contracts/writing-blueprint";
import {
  boundChartJobToFigureConfig,
  buildGenerateChartCallsFromJobs,
  collectBoundChartJobsForSection,
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
