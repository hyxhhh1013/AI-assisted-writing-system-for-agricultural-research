import {
  chartConfigToPasteText,
  chartTypeToFigureId,
  collectChartConfigsFromSources,
  parseProjectCharts,
} from "@/contracts/figure";
import type { ChartConfig, DataSourceAnalysis, EvidenceClaim } from "@/contracts/data-source";
import {
  parseDataClaims,
  parseDataSources,
} from "@/contracts/project";
import prisma from "@/lib/prisma";

export interface AgentPlotCandidate {
  index: number;
  title: string;
  chartType: string;
  figureId: string;
  sourceFileName: string;
  xLabel?: string;
  yLabel?: string;
  previewCsv: string;
}

export interface AgentPlotSourcesBundle {
  sources: DataSourceAnalysis[];
  claims: EvidenceClaim[];
  candidates: AgentPlotCandidate[];
  existingChartCount: number;
}

function findSourceFile(
  sources: DataSourceAnalysis[],
  cfg: ChartConfig,
): string {
  for (const source of sources) {
    if (source.chartConfigs?.some((c) => c.title === cfg.title && c.type === cfg.type)) {
      return source.fileName;
    }
  }
  return sources[0]?.fileName ?? "试验数据";
}

/** 从项目加载可配图数据源与推荐图目录（index 稳定，供 generate_chart 引用） */
export async function loadAgentPlotSources(
  userId: string,
  projectId: string,
): Promise<AgentPlotSourcesBundle | null> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, userId },
    select: {
      dataSources: true,
      dataClaims: true,
      charts: true,
    },
  });
  if (!project) return null;

  const sources = parseDataSources({
    dataSources: project.dataSources ?? undefined,
  });
  const claims = parseDataClaims({
    dataClaims: project.dataClaims ?? undefined,
  });
  const configs = collectChartConfigsFromSources(sources);
  const candidates: AgentPlotCandidate[] = configs.map((cfg, index) => {
    const csv = chartConfigToPasteText(cfg);
    return {
      index,
      title: cfg.title,
      chartType: cfg.type,
      figureId: chartTypeToFigureId(cfg.type),
      sourceFileName: findSourceFile(sources, cfg),
      xLabel: cfg.xLabel,
      yLabel: cfg.yLabel,
      previewCsv: csv.length > 400 ? `${csv.slice(0, 400)}…` : csv,
    };
  });

  return {
    sources,
    claims,
    candidates,
    existingChartCount: parseProjectCharts(project.charts).length,
  };
}

export function resolvePlotCandidate(
  bundle: AgentPlotSourcesBundle,
  chartIndex: number,
): { cfg: ChartConfig; csv: string; figureId: string } | { error: string } {
  const configs = collectChartConfigsFromSources(bundle.sources);
  if (!Number.isInteger(chartIndex) || chartIndex < 0 || chartIndex >= configs.length) {
    return {
      error: `chartIndex 无效（0–${Math.max(configs.length - 1, 0)}）。请先 list_plot_sources 再选。`,
    };
  }
  const cfg = configs[chartIndex];
  return {
    cfg,
    csv: chartConfigToPasteText(cfg),
    figureId: chartTypeToFigureId(cfg.type),
  };
}

/** 无表格时给 Agent 的用户引导文案 */
export function noPlotDataGuidance(claimCount: number, existingCharts: number): string {
  const parts = [
    "项目里还没有可直接出图的试验数据表（dataSources / 推荐 ChartConfig 为空）。",
    "请用户：① 在「数据」面板上传 CSV/Excel 并分析；或 ② 在对话里粘贴 CSV（含表头），再调用 generate_chart(csvData=...)。",
  ];
  if (claimCount > 0) {
    parts.push(`目前有 ${claimCount} 条证据声明，但仍缺结构化表格；优先让用户补数据文件。`);
  }
  if (existingCharts > 0) {
    parts.push(`项目图表库已有 ${existingCharts} 张图，可先问用户要不要改已有图。`);
  }
  return parts.join(" ");
}
