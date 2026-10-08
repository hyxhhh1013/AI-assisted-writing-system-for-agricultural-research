/** 数据组图：POST /api/chart/composite */

export interface CompositeRenderPanel {
  chartType: string;
  csv: string;
  title?: string;
  xLabel?: string;
  yLabel?: string;
  yMin?: string;
  yMax?: string;
  showLegend?: boolean;
  palette?: "nature" | "agr" | "tol";
  span?: 1 | 2;
}

export async function renderCompositeFigure(input: {
  title: string;
  preset?: "nature" | "agr_journal" | "print_bw";
  cols?: 1 | 2 | 3;
  panels: CompositeRenderPanel[];
}): Promise<{ imageUrl: string; panelCount: number }> {
  const res = await fetch("/api/chart/composite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = (await res.json().catch(() => ({}))) as {
    imageUrl?: string;
    panelCount?: number;
    error?: string;
  };
  if (!res.ok || !data.imageUrl) {
    throw new Error(data.error || "组图生成失败");
  }
  return { imageUrl: data.imageUrl, panelCount: data.panelCount ?? input.panels.length };
}
