/**
 * 蓝图 figurePlan → 可出图任务。
 * 扩写只注入「规划配图」文案，不会画图；写节成功后用这些 job 排队 generate_chart
 * 或专家工具扩写走 generateFigure。
 */

import type { ChartConfig } from "@/contracts/data-source";
import type { ProjectWritingMode } from "@/contracts/writing-mode";
import type { FigurePlanItem, WritingBlueprint } from "@/contracts/writing-blueprint";
import { chartTypeToFigureId } from "@/contracts/figure";
import {
  figureBelongsToSection,
  resolveChartConfigIndex,
} from "@/lib/blueprint-utils";
import { mapToSectionForMode } from "@/lib/utils";

export const MAX_BLUEPRINT_CHART_JOBS = 6;

export interface BlueprintChartJob {
  figurePlanId: string;
  chartIndex: number;
  caption: string;
  title: string;
  chartType: ChartConfig["type"];
  figureId: string;
  xLabel?: string;
  yLabel?: string;
  labels: string[];
  datasets: ChartConfig["datasets"];
}

export function figurePlanItemMatchesSection(
  item: FigurePlanItem,
  sectionKey: string,
  mode: ProjectWritingMode | undefined,
  subsectionTitle?: string,
): boolean {
  const matchesKey = mapToSectionForMode(item.sectionPath, mode) === sectionKey;
  const sub = subsectionTitle?.trim();
  if (sub) {
    return (
      matchesKey
      && (item.sectionPath.includes(sub) || figureBelongsToSection(item.sectionPath, sub))
    );
  }
  return matchesKey;
}

export function collectBoundChartJobsForSection(input: {
  blueprint: WritingBlueprint | null | undefined;
  sectionKey: string;
  mode?: ProjectWritingMode;
  subsectionTitle?: string;
  chartConfigs: ChartConfig[];
  maxJobs?: number;
}): { jobs: BlueprintChartJob[]; unboundRequired: FigurePlanItem[] } {
  const blueprint = input.blueprint;
  const cap = Math.min(
    Math.max(input.maxJobs ?? MAX_BLUEPRINT_CHART_JOBS, 1),
    MAX_BLUEPRINT_CHART_JOBS,
  );
  if (!blueprint || input.chartConfigs.length === 0) {
    const unboundRequired = (blueprint?.figurePlan.items ?? []).filter(
      (item) =>
        item.type === "chart"
        && item.priority === "required"
        && figurePlanItemMatchesSection(
          item,
          input.sectionKey,
          input.mode,
          input.subsectionTitle,
        ),
    );
    return { jobs: [], unboundRequired };
  }

  const jobs: BlueprintChartJob[] = [];
  const unboundRequired: FigurePlanItem[] = [];
  const usedIndex = new Set<number>();

  for (const item of blueprint.figurePlan.items) {
    if (item.type !== "chart") continue;
    if (
      !figurePlanItemMatchesSection(
        item,
        input.sectionKey,
        input.mode,
        input.subsectionTitle,
      )
    ) {
      continue;
    }

    const idx = resolveChartConfigIndex(item, input.chartConfigs);
    if (idx === null || usedIndex.has(idx)) {
      if (item.priority === "required") unboundRequired.push(item);
      continue;
    }
    const cfg = input.chartConfigs[idx];
    if (!cfg || cfg.labels.length === 0 || cfg.datasets.length === 0) {
      if (item.priority === "required") unboundRequired.push(item);
      continue;
    }
    usedIndex.add(idx);
    jobs.push({
      figurePlanId: item.id,
      chartIndex: idx,
      caption: item.suggestedCaption.trim() || cfg.title,
      title: cfg.title || item.suggestedCaption,
      chartType: cfg.type,
      figureId: chartTypeToFigureId(cfg.type),
      xLabel: cfg.xLabel,
      yLabel: cfg.yLabel,
      labels: cfg.labels,
      datasets: cfg.datasets,
    });
    if (jobs.length >= cap) break;
  }

  return { jobs, unboundRequired };
}

export function jobAlreadyCoveredByText(text: string, job: BlueprintChartJob): boolean {
  const t = text.trim();
  if (!t) return false;
  if (job.caption && t.includes(`![${job.caption}](`)) return true;
  if (job.title && t.includes(`![${job.title}](`)) return true;
  return false;
}

export function boundChartJobToFigureConfig(job: BlueprintChartJob): {
  tool: "chart";
  config: Record<string, unknown>;
  caption: string;
} {
  return {
    tool: "chart",
    config: {
      type: job.chartType,
      title: job.title,
      xLabel: job.xLabel,
      yLabel: job.yLabel,
      data: {
        labels: job.labels,
        datasets: job.datasets,
      },
    },
    caption: job.caption,
  };
}

export interface BlueprintGenerateChartCall {
  id: string;
  name: "generate_chart";
  args: Record<string, unknown>;
}

export function buildGenerateChartCallsFromJobs(
  jobs: BlueprintChartJob[],
  sectionKey: string,
  alreadyQueued: readonly { name: string; args: Record<string, unknown> }[],
): BlueprintGenerateChartCall[] {
  const queuedIdx = new Set(
    alreadyQueued
      .filter((c) => c.name === "generate_chart")
      .flatMap((c) => {
        const n = Number(c.args.chartIndex);
        return Number.isFinite(n) ? [Math.floor(n)] : [];
      }),
  );
  const out: BlueprintGenerateChartCall[] = [];
  for (const job of jobs) {
    if (queuedIdx.has(job.chartIndex)) continue;
    queuedIdx.add(job.chartIndex);
    out.push({
      id: `bp_chart_${job.figurePlanId}_${job.chartIndex}`,
      name: "generate_chart",
      args: {
        chartIndex: job.chartIndex,
        title: job.title,
        caption: job.caption,
        xLabel: job.xLabel ?? "",
        yLabel: job.yLabel ?? "",
        sectionKey,
        persistToProject: "true",
      },
    });
  }
  return out;
}

const NARRATIVE_FIGURE_TYPES = new Set(["flow", "schematic", "table", "other"]);

export interface BlueprintNarrativeFigureCall {
  id: string;
  name: "draft_mechanism_figure" | "generate_table";
  args: Record<string, unknown>;
}

function shortFigureStep(text: string): string {
  const cut = text.replace(/\s+/g, "").split(/[，。；、]/)[0] ?? "";
  return cut.slice(0, 16) || "过程";
}

function guideKeyPointsForItem(
  blueprint: WritingBlueprint,
  item: FigurePlanItem,
): string[] {
  const guide = blueprint.sectionGuides.find(
    (g) => g.sectionPath === item.sectionPath || figureBelongsToSection(item.sectionPath, g.sectionPath),
  );
  return (guide?.keyPoints ?? []).map((p) => p.trim()).filter(Boolean).slice(0, 4);
}

/** 综述示意图、流程图、对比表不依赖试验 CSV，写节后直接排队。 */
export function buildNarrativeFigureCalls(input: {
  blueprint: WritingBlueprint | null | undefined;
  sectionKey: string;
  mode?: ProjectWritingMode;
  subsectionTitle?: string;
  draft: string;
  alreadyQueued: readonly { name: string; args: Record<string, unknown> }[];
}): BlueprintNarrativeFigureCall[] {
  const blueprint = input.blueprint;
  if (!blueprint) return [];
  const queuedTitles = new Set(
    input.alreadyQueued
      .map((c) => String(c.args.title ?? c.args.caption ?? "").trim())
      .filter(Boolean),
  );
  const out: BlueprintNarrativeFigureCall[] = [];
  for (const item of blueprint.figurePlan.items) {
    if (item.priority !== "required") continue;
    const reviewChart = input.mode === "review"
      && item.type === "chart"
      && item.dataSource !== "experiment";
    if (!NARRATIVE_FIGURE_TYPES.has(item.type) && !reviewChart) continue;
    if (
      !figurePlanItemMatchesSection(
        item,
        input.sectionKey,
        input.mode,
        input.subsectionTitle,
      )
    ) {
      continue;
    }
    const title = item.suggestedCaption.trim() || item.purpose.trim();
    if (!title || input.draft.includes(title) || queuedTitles.has(title)) continue;
    const points = guideKeyPointsForItem(blueprint, item);
    const steps = points.map(shortFigureStep);
    while (steps.length < 2) {
      steps.push(shortFigureStep(steps.length === 0 ? item.purpose : title));
    }
    if (item.type === "table") {
      out.push({
        id: `bp_table_${item.id}`,
        name: "generate_table",
        args: {
          title,
          sectionKey: input.sectionKey,
          rows: [
            ["要点", "说明"],
            ...points.map((p) => [shortFigureStep(p), p.slice(0, 80)]),
            ...(points.length === 0 ? [[shortFigureStep(title), item.purpose.slice(0, 80)]] : []),
          ],
        },
      });
    } else {
      out.push({
        id: `bp_fig_${item.id}`,
        name: "draft_mechanism_figure",
        args: {
          kind: "flow",
          title,
          claim: item.purpose.slice(0, 120),
          flowSteps: steps.slice(0, 6),
          layout: "chain",
          sectionKey: input.sectionKey,
          persistToProject: "true",
        },
      });
    }
    queuedTitles.add(title);
    if (out.length >= 2) break;
  }
  return out;
}

export function formatUnboundBlueprintChartsNudge(
  items: FigurePlanItem[],
): string | null {
  if (items.length === 0) return null;
  const lines = items.slice(0, 4).map(
    (i) => `· ${i.suggestedCaption || i.id}（${i.purpose}）`,
  );
  return (
    "System: 本节蓝图有必需数据图，但项目里还没有绑定可用的试验表。"
    + "请提示用户在 Agent 对话框上传 CSV/Excel，或 ingest_project_data / list_plot_sources 后再 generate_chart。"
    + `未出图：\n${lines.join("\n")}`
  );
}
