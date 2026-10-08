/**
 * 数据组图：从已有图表快照抽出 CSV，排成 a/b/c 网格。
 * 示意图没有数据快照，不能进这张组图。
 */

import {
  decodeFigureSpecParam,
  figureSpecToPrefill,
  type ProjectChartAsset,
} from "@/contracts/figure";

export interface CompositePanelDraft {
  key: string;
  assetId: string;
  sourceCaption: string;
  chartType: string;
  csv: string;
  title: string;
  xLabel: string;
  yLabel: string;
  yMin: string;
  yMax: string;
  showLegend: boolean;
  palette: "" | "nature" | "agr" | "tol";
  span: 1 | 2;
}

export interface CompositeSlot {
  row: number;
  col: number;
  span: 1 | 2;
}

export function assetToCompositePanel(
  asset: ProjectChartAsset,
): CompositePanelDraft | null {
  if (!asset.figureSpecEnc) return null;
  const spec = decodeFigureSpecParam(asset.figureSpecEnc);
  if (!spec) return null;
  const prefill = figureSpecToPrefill(spec);
  const csv = prefill?.pasteText?.trim() ?? "";
  const chartType = prefill?.figureId?.trim() ?? "";
  if (!csv || !chartType) return null;
  return {
    key: asset.id,
    assetId: asset.id,
    sourceCaption: asset.caption || prefill?.title || chartType,
    chartType,
    csv,
    title: prefill?.title ?? "",
    xLabel: prefill?.xLabel ?? "",
    yLabel: prefill?.yLabel ?? "",
    yMin: "",
    yMax: "",
    showLegend: true,
    palette: "",
    span: 1,
  };
}

export function compositePanelCountError(count: number): string | null {
  if (count < 2) return "组图至少两张";
  if (count > 6) return "组图最多六张";
  return null;
}

/** 与 scripts/charts/panel_multi.py 的摆放一致。 */
export function placeCompositePanels(
  spans: readonly (1 | 2)[],
  cols: number,
): CompositeSlot[] {
  const width = cols < 1 ? 1 : cols > 3 ? 3 : cols;
  const slots: CompositeSlot[] = [];
  let row = 0;
  let col = 0;
  for (const raw of spans) {
    const span: 1 | 2 = width >= 2 && raw === 2 ? 2 : 1;
    if (col + span > width) {
      row += 1;
      col = 0;
    }
    slots.push({ row, col, span });
    col += span;
    if (col >= width) {
      row += 1;
      col = 0;
    }
  }
  return slots;
}
