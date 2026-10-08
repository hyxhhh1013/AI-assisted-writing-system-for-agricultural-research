import type { ChartConfig, DataSourceAnalysis } from "@/contracts/data-source";
import { chartConfigToPrefill, type ChartPanelPrefill } from "@/contracts/figure";

const MAX_POINTS = 360;

export interface TableGroupSeed {
  label: string;
  n: string;
  mean: string;
  sd: string;
  variable: string;
}

function strideSample<T>(items: T[], max: number): T[] {
  if (items.length <= max) return items;
  const stride = Math.ceil(items.length / max);
  const out = items.filter((_, index) => index % stride === 0);
  const last = items[items.length - 1];
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function downsampleConfig(cfg: ChartConfig): { cfg: ChartConfig; dropped: boolean } {
  if (cfg.labels.length <= MAX_POINTS) return { cfg, dropped: false };
  const indexes = strideSample(cfg.labels.map((_, index) => index), MAX_POINTS);
  return {
    dropped: true,
    cfg: {
      ...cfg,
      labels: indexes.map((index) => cfg.labels[index] ?? ""),
      datasets: cfg.datasets.map((dataset) => ({
        ...dataset,
        data: indexes.map((index) => dataset.data[index] ?? 0),
      })),
    },
  };
}

function csvFromPreview(source: DataSourceAnalysis): string | null {
  const rows = source.preview;
  if (!rows || rows.length === 0) return null;
  const headers = (source.previewHeaders?.length
    ? source.previewHeaders
    : source.columns.map((column) => column.name)
  ).slice(0, rows[0]?.length ?? 0);
  if (headers.length === 0) return null;
  const body = rows.map((row) => row.map((cell) => {
    const text = cell ?? "";
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(","));
  return [headers.join(","), ...body].join("\n");
}

/**
 * 把已入库的一块变成绘图页能直接改的预填。
 * 长曲线抽稀，避免编辑器塞进整张谱。
 */
export function prefillFromSource(source: DataSourceAnalysis): {
  prefill: ChartPanelPrefill;
  note: string;
} | null {
  const stored = source.chartConfigs?.[0];
  if (stored && stored.labels.length > 0 && stored.datasets.length > 0) {
    const { cfg, dropped } = downsampleConfig(stored);
    const figureId = cfg.type === "line" ? "line" : cfg.type === "scatter" ? "scatter" : "bar_grouped";
    const prefill = chartConfigToPrefill(cfg, figureId);
    const multi = cfg.datasets.length > 1 ? "多条曲线画在同一张折线上。要错位叠加，再到左侧选堆叠谱。" : "";
    const thin = dropped ? `原表 ${source.rowCount} 行，编辑器里抽成 ${cfg.labels.length} 点，方便改坐标轴和样式。` : "";
    return {
      prefill,
      note: [thin, multi].filter(Boolean).join("") || "数据已填入，可直接改标题和坐标轴。",
    };
  }

  const csv = csvFromPreview(source);
  if (!csv) return null;
  const numeric = source.columns.length > 0 && source.columns.every((column) => column.type === "numeric");
  const figureId = source.rowCount >= 20 && numeric ? "line" : "bar_grouped";
  const headers = source.previewHeaders ?? source.columns.map((column) => column.name);
  return {
    prefill: {
      pasteText: csv,
      title: source.fileName,
      xLabel: headers[0],
      yLabel: headers[1],
      figureId,
    },
    note: source.previewTail
      ? "只带了入库时留下的开头和结尾，中间行不在编辑器里。"
      : "数据已填入，可直接改标题和坐标轴。",
  };
}

/** 三线表只吃已经算好的分组均值，不把整条谱填进去。 */
export function tableSeedsFromSource(source: DataSourceAnalysis): TableGroupSeed[] | null {
  const stat = source.stats.find((item) => (item.groups?.length ?? 0) >= 2);
  if (!stat?.groups) return null;
  return stat.groups.map((group) => ({
    label: group.label,
    n: String(group.n),
    mean: String(group.mean),
    sd: String(group.sd),
    variable: stat.variable,
  }));
}
