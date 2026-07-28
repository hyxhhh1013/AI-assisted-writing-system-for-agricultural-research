/**
 * CSV/TSV → 图表 labels/datasets（服务端与客户端共用，勿依赖 React）
 * 逻辑对齐 hooks/use-chart-panel.parseTabularData 的主路径。
 */

export interface ChartTabularParsed {
  labels: string[];
  datasets: { label: string; data: number[] }[];
  forest?: {
    estimates: number[];
    ci_low: number[];
    ci_high: number[];
  };
}

const ERROR_SUFFIXES = ["_sd", "_sem", "_se", "_err", "_std", "_ci"];

function detectSep(firstLine: string): string {
  if (firstLine.includes("\t")) return "\t";
  if (firstLine.includes(";")) return ";";
  if (firstLine.includes("，")) return "，";
  return ",";
}

function parseForestTabular(text: string): ChartTabularParsed | null {
  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;
  const sep = detectSep(lines[0]);
  const labels: string[] = [];
  const estimates: number[] = [];
  const ci_low: number[] = [];
  const ci_high: number[] = [];

  for (const line of lines.slice(1)) {
    const parts = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (parts.length < 4) continue;
    const est = parseFloat(parts[1]);
    const lo = parseFloat(parts[2]);
    const hi = parseFloat(parts[3]);
    if (Number.isNaN(est) || Number.isNaN(lo) || Number.isNaN(hi)) continue;
    labels.push(parts[0]);
    estimates.push(est);
    ci_low.push(lo);
    ci_high.push(hi);
  }
  if (labels.length === 0) return null;
  return { labels, datasets: [], forest: { estimates, ci_low, ci_high } };
}

/** 解析表格文本为图表回放数据；失败返回 null */
export function parseChartTabular(
  text: string,
  chartId?: string,
): ChartTabularParsed | null {
  if (chartId === "forest") return parseForestTabular(text);

  const lines = text.split("\n").filter((l) => l.trim());
  if (lines.length < 2) return null;

  const sep = detectSep(lines[0]);
  const headers = lines[0].split(sep).map((h) => h.trim().replace(/^"|"$/g, ""));
  const dataLines = lines.slice(1).filter((l) => l.trim());

  const labels: string[] = [];
  const valueColIndices: number[] = [];
  const errorMap = new Map<number, number>();

  for (let ci = 1; ci < headers.length; ci++) {
    const h = headers[ci];
    const errSuffix = ERROR_SUFFIXES.find((s) => h.toLowerCase().endsWith(s));
    if (errSuffix) {
      const base = h.slice(0, -errSuffix.length);
      const baseIdx = headers.findIndex((x, i) => i > 0 && i !== ci && x === base);
      if (baseIdx > 0) errorMap.set(baseIdx, ci);
      continue;
    }
    valueColIndices.push(ci);
  }

  const columns: number[][] = valueColIndices.map(() => []);

  for (const line of dataLines) {
    const parts = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    labels.push(parts[0]);
    valueColIndices.forEach((colIdx, vi) => {
      const v = parseFloat(parts[colIdx]);
      columns[vi].push(Number.isNaN(v) ? 0 : v);
    });
  }

  if (labels.length === 0 || valueColIndices.length === 0) return null;

  return {
    labels,
    datasets: valueColIndices.map((colIdx, i) => ({
      label: headers[colIdx] || `系列${i + 1}`,
      data: columns[i],
    })),
  };
}
