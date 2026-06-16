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

const CHART_TYPE_TO_FIGURE: Record<string, string> = {
  bar: "bar_grouped",
  grouped_bar: "bar_grouped",
  stacked_bar: "bar_stacked",
  pct_stacked: "bar_pct_stacked",
  line: "line",
  scatter: "scatter",
  pie: "pie",
  heatmap: "heatmap",
  area: "area",
  forest: "forest",
  radar: "radar",
};

/** 写作 FIGURE 标记 tool → registry figure id */
export function figureToolToRegistryId(
  tool: string,
  config?: Record<string, unknown>,
): string {
  if (tool === "flow" || tool === "mechanism") return "flow";
  if (tool === "chart") {
    const raw = String(config?.type ?? config?.chart_type ?? "bar");
    return CHART_TYPE_TO_FIGURE[raw] ?? chartTypeToFigureId(raw as ChartType);
  }
  if (tool.startsWith("xrd_") || tool === "molecule" || tool === "table_three_line") {
    return tool;
  }
  return tool;
}

/** FIGURE chart config（labels/datasets）→ plot 预填 */
export function figureChartConfigToPrefill(
  config: Record<string, unknown>,
  caption: string,
): ChartPanelPrefill | null {
  const data = config.data;
  if (!isRecord(data)) return null;
  const labels = data.labels;
  const datasets = data.datasets;
  if (!Array.isArray(labels) || !Array.isArray(datasets)) return null;

  const parsedDatasets: ChartConfig["datasets"] = [];
  for (const item of datasets) {
    if (!isRecord(item) || !Array.isArray(item.data)) continue;
    const nums = item.data.map((v) => (typeof v === "number" ? v : Number(v)));
    if (nums.some((n) => Number.isNaN(n))) continue;
    parsedDatasets.push({
      label: typeof item.label === "string" ? item.label : "数据",
      data: nums,
    });
  }
  if (parsedDatasets.length === 0) return null;

  const cfg: ChartConfig = {
    type: (config.type ?? config.chart_type ?? "bar") as ChartType,
    title: typeof config.title === "string" ? config.title : caption,
    xLabel: typeof config.x_label === "string" ? config.x_label : undefined,
    yLabel: typeof config.y_label === "string" ? config.y_label : undefined,
    labels: labels.map((l) => String(l)),
    datasets: parsedDatasets,
  };
  return chartConfigToPrefill(cfg, figureToolToRegistryId("chart", config));
}

/** FigureSpec → ChartPanelPrefill（仅 chart 类） */
export function figureSpecToPrefill(spec: FigureSpec): ChartPanelPrefill | null {
  if (spec.tool !== "chart" || !isRecord(spec.config)) return null;
  return figureChartConfigToPrefill(spec.config, spec.caption);
}

function utf8ToBase64Url(text: string): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(text, "utf8").toString("base64url");
  }
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToUtf8(encoded: string): string {
  const padded = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const base64 = padded + "=".repeat(padLen);
  if (typeof Buffer !== "undefined") {
    return Buffer.from(base64, "base64").toString("utf8");
  }
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function encodeFigureSpecParam(spec: FigureSpec): string {
  return utf8ToBase64Url(JSON.stringify(spec));
}

export function decodeFigureSpecParam(encoded: string): FigureSpec | null {
  try {
    const parsed: unknown = JSON.parse(base64UrlToUtf8(encoded));
    if (!isRecord(parsed)) return null;
    const tool = parsed.tool;
    const config = parsed.config;
    const caption = parsed.caption;
    if (typeof tool !== "string" || !isRecord(config) || typeof caption !== "string") {
      return null;
    }
    if (tool !== "chart" && tool !== "flow" && tool !== "mechanism") return null;
    return { tool, config, caption };
  } catch {
    return null;
  }
}

export interface PlotPageHrefParams {
  projectId?: string;
  figureId?: string;
  chartIdx?: number;
  figureSpec?: FigureSpec;
}

/** 构建 /plot 深链（Evidence、FIGURE 标记、charts 资产复用） */
export function buildPlotPageHref(params: PlotPageHrefParams): string {
  const q = new URLSearchParams();
  if (params.projectId) q.set("id", params.projectId);
  if (params.figureId) q.set("figure", params.figureId);
  if (params.chartIdx !== undefined && !Number.isNaN(params.chartIdx)) {
    q.set("chartIdx", String(params.chartIdx));
  }
  if (params.figureSpec) {
    q.set("figureSpec", encodeFigureSpecParam(params.figureSpec));
  }
  const qs = q.toString();
  return qs ? `/plot?${qs}` : "/plot";
}

/** findFigureBlocks 的单条 json → plot 深链 */
export function figureBlockJsonToPlotHref(
  projectId: string,
  block: Record<string, unknown>,
): string | null {
  const tool = block.tool;
  const config = block.config;
  const caption = block.caption;
  if (typeof tool !== "string" || !isRecord(config) || typeof caption !== "string") {
    return null;
  }
  const figureId = figureToolToRegistryId(tool, config);
  if (tool === "chart") {
    return buildPlotPageHref({
      projectId,
      figureId,
      figureSpec: { tool: "chart", config, caption },
    });
  }
  if (tool === "flow" || tool === "mechanism") {
    return buildPlotPageHref({
      projectId,
      figureId,
      figureSpec: { tool: "flow", config, caption },
    });
  }
  return buildPlotPageHref({ projectId, figureId });
}
