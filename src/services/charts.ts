/** POST /api/chart — 通用图表生成（FormData） */

export interface ChartGenericFileConfig {
  title: string;
  chart_type: string;
  x_label?: string;
  y_label?: string;
}

export interface ChartPasteInlineConfig {
  data: { labels: string[]; datasets: Array<Record<string, unknown>> };
  chart_type: string;
  title: string;
  x_label: string;
  y_label: string;
}

export interface ChartGenerateResponse {
  imageBase64?: string;
  imageUrl?: string;
  caption?: string;
  error?: string;
}

export async function postChartForm(body: FormData): Promise<ChartGenerateResponse> {
  const res = await fetch("/api/chart", { method: "POST", body });
  const data = (await res.json()) as ChartGenerateResponse;
  if (!res.ok) throw new Error(data.error || "生成失败");
  return data;
}
