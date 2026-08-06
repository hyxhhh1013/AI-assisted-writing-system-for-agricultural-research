/** POST /api/chart — 通用图表生成（FormData） */

import type { ChartStyleConfig } from "@/contracts/chart-style";

export interface ChartGenericFileConfig {
  title: string;
  chart_type: string;
  x_label?: string;
  y_label?: string;
  style?: ChartStyleConfig;
  [key: string]: unknown;
}

export interface ChartPasteInlineConfig {
  data: { labels: string[]; datasets: Array<Record<string, unknown>> };
  chart_type: string;
  title: string;
  x_label: string;
  y_label: string;
  style?: ChartStyleConfig;
  [key: string]: unknown;
}

export interface ChartStyleValidationCheck {
  level: string;
  code: string;
  message: string;
}

export interface ChartStyleValidation {
  ok: boolean;
  preset?: string;
  columns?: number;
  target_width_in?: number;
  checks?: ChartStyleValidationCheck[];
}

export interface ChartGenerateResponse {
  imageBase64?: string;
  imageUrl?: string;
  svgUrl?: string;
  pdfUrl?: string;
  fileName?: string;
  baseName?: string;
  caption?: string;
  error?: string;
  styleValidation?: ChartStyleValidation;
  figWidth?: number;
  columns?: number;
  preset?: string;
}

export async function postChartForm(body: FormData): Promise<ChartGenerateResponse> {
  const res = await fetch("/api/chart", { method: "POST", body });
  const data = (await res.json()) as ChartGenerateResponse;
  if (!res.ok) throw new Error(data.error || "生成失败");
  return data;
}
