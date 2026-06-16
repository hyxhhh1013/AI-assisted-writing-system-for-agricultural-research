import type { ChartConfig, ChartType, DataSourceAnalysis } from "@/contracts/data-source";

export type FigureTool = "chart" | "flow" | "mechanism";

export interface FigureSpec {
  tool: FigureTool;
  config: Record<string, unknown>;
  caption: string;
}

export interface FigureGenerationResult {
  spec: string;
  tool: string;
  config: string;
  caption: string;
  status: "pending" | "generating" | "done" | "failed";
  imageUrl?: string;
}

/** 项目已生成/已插入的图表资产（存 Project.charts JSON） */
export interface ProjectChartAsset {
  id: string;
  figureId: string;
  caption: string;
  imageUrl: string;
  svgUrl?: string;
  pdfUrl?: string;
  sectionKey?: string;
  createdAt: number;
}

export type ChartPatchOp =
  | {
      op: "append";
      asset: Omit<ProjectChartAsset, "id" | "createdAt"> & { id?: string };
    }
  | { op: "delete"; id: string };

export interface ChartsPatchResponse {
  charts: ProjectChartAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isProjectChartAsset(value: unknown): value is ProjectChartAsset {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string"
    && typeof value.figureId === "string"
    && typeof value.caption === "string"
    && typeof value.imageUrl === "string"
    && typeof value.createdAt === "number"
  );
}

export function parseProjectCharts(raw: string | null | undefined): ProjectChartAsset[] {
  if (!raw?.trim()) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isProjectChartAsset);
  } catch {
    return [];
  }
}

export function serializeProjectCharts(assets: ProjectChartAsset[]): string {
  return JSON.stringify(assets);
}

/** ChartConfig.type → registry figure id */
export function chartTypeToFigureId(type: ChartType): string {
  switch (type) {
    case "line":
      return "line";
    case "scatter":
      return "scatter";
    case "grouped_bar":
    case "bar":
    default:
      return "bar_grouped";
  }
}

/** 将推荐图表配置转为 CSV 粘贴文本 */
export function chartConfigToPasteText(cfg: ChartConfig): string {
  const xHeader = cfg.xLabel?.trim() || "类别";
  const headers = [xHeader, ...cfg.datasets.map((d) => d.label)];
  const rows = cfg.labels.map((label, rowIdx) => {
    const cells = cfg.datasets.map((d) => String(d.data[rowIdx] ?? ""));
    return [label, ...cells].join(",");
  });
  return [headers.join(","), ...rows].join("\n");
}

/** 从已持久化的 dataSources 收集推荐图表（含旧数据 groups 回退） */
export function collectChartConfigsFromSources(sources: DataSourceAnalysis[]): ChartConfig[] {
  const stored = sources.flatMap((s) => s.chartConfigs ?? []);
  if (stored.length > 0) return stored;

  const derived: ChartConfig[] = [];
  for (const source of sources) {
    for (const stat of source.stats) {
      const groups = stat.groups;
      if (!groups || groups.length < 2) continue;
      derived.push({
        type: groups.length <= 6 ? "bar" : "grouped_bar",
        title: `各处理${stat.variable}对比`,
        xLabel: "处理",
        yLabel: stat.variable,
        labels: groups.map((g) => g.label),
        datasets: [{ label: stat.variable, data: groups.map((g) => g.mean) }],
      });
    }
  }
  return derived;
}

export interface ChartPanelPrefill {
  pasteText: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  figureId?: string;
}

export function chartConfigToPrefill(cfg: ChartConfig, figureId?: string): ChartPanelPrefill {
  return {
    pasteText: chartConfigToPasteText(cfg),
    title: cfg.title,
    xLabel: cfg.xLabel,
    yLabel: cfg.yLabel,
    figureId: figureId ?? chartTypeToFigureId(cfg.type),
  };
}
