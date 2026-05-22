/** 数据驱动写作 — 证据声明类型 */

// === 分析结果 ===

export interface ColumnInfo {
  name: string;
  type: "numeric" | "group" | "text";
  count: number;
  uniqueValues?: number;
}

export interface GroupStat {
  label: string;
  mean: number;
  sd: number;
  n: number;
}

export interface ComparisonClaim {
  groupA: string;
  groupB: string;
  changePct: number;
  pValue?: number;
  significant: boolean;
}

export interface VariableStats {
  variable: string;
  unit?: string;
  mean: number;
  sd: number;
  min: number;
  max: number;
  groups?: GroupStat[];
  comparisons?: ComparisonClaim[];
  trend?: "increasing" | "decreasing" | "non_monotonic" | "no_trend";
  correlations?: { with: string; r: number; pValue?: number }[];
}

export interface DataSourceAnalysis {
  fileName: string;
  rowCount: number;
  columns: ColumnInfo[];
  stats: VariableStats[];
  generatedAt: number;
}

// === 证据声明 ===

export type ClaimType = "mean" | "comparison" | "trend" | "correlation" | "model_fit" | "ranking";

export interface EvidenceClaim {
  id: string;           // "D1-C3"
  sourceId: string;     // "D1"
  sourceType: "data" | "literature";
  type: ClaimType;
  text: string;         // 人类可读的数据陈述
  values: Record<string, number | string>;
  variables: string[];
  unit?: string;
  pValue?: number;
  tolerance: number;    // 默认 0.05（5%）
}

// === 证据包 ===

export interface EvidencePack {
  claims: EvidenceClaim[];
  summary: string;
}

// === 图表规约 ===

export type ChartType = "bar" | "grouped_bar" | "line" | "scatter" | "box";

export interface ChartConfig {
  type: ChartType;
  title: string;
  xLabel: string;
  yLabel: string;
  labels: string[];
  datasets: { label: string; data: number[] }[];
}
