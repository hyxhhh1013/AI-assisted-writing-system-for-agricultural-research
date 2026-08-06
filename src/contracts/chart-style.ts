/** 图表样式 — 前后端与 registry global_style_fields 对齐 */

export type ChartStylePreset =
  | "nature"
  | "agr_journal"
  | "agr_cn"
  | "ieee"
  | "acs"
  | "elsevier"
  | "print_bw"
  | "slide";

export type ChartPalette =
  | "nature"
  | "agr"
  | "biomass"
  | "bright"
  | "tol"
  | "muted"
  | "high_vis"
  | "pastel"
  | "print_bw";

export type ChartExportFormat = "png" | "svg" | "pdf" | "tiff";

export interface ChartStyleConfig {
  preset?: ChartStylePreset;
  /** 1=单栏刊宽，2=双栏刊宽（对照 plotstyle 栏宽 mm） */
  columns?: 1 | 2 | number;
  font_size?: number;
  title_font_size?: number;
  axes_linewidth?: number;
  dpi?: number;
  fig_width?: number;
  fig_height?: number;
  palette?: ChartPalette;
  show_grid?: boolean;
  legend_frame?: boolean;
  legend_loc?: string;
  bar_edge?: boolean;
  panel_label?: string;
  show_values?: boolean;
  export_formats?: ChartExportFormat[];
  x_tick_rotation?: number;
  y_sci_notation?: boolean;
  /** SciencePlots / IEEE：不同系列用不同标记，灰度印刷可辨 */
  use_markers?: boolean;
}

export interface ChartRegistryField {
  key: string;
  label: string;
  type: "text" | "number" | "select" | "boolean";
  options?: string[];
  default?: string | number | boolean;
  group?: "basic" | "style" | "advanced" | "chart_specific";
  display?: "visible" | "advanced";
  min?: number;
  max?: number;
  step?: number;
}

export const CHART_STYLE_PRESET_LABELS: Record<ChartStylePreset, string> = {
  nature: "Nature（单栏 89mm、7pt）",
  agr_journal: "农业期刊（双栏宽图、网格）",
  agr_cn: "国内农学刊（双栏近似）",
  ieee: "IEEE（窄栏 + 标记 + 600dpi）",
  acs: "ACS（化学/催化刊）",
  elsevier: "Elsevier（双栏）",
  print_bw: "打印灰度（600dpi）",
  slide: "汇报幻灯（大字号）",
};

export const CHART_PALETTE_LABELS: Record<ChartPalette, string> = {
  nature: "Nature 学术色",
  agr: "农学经典色",
  biomass: "生物质/催化语义色",
  bright: "色盲友好 bright",
  tol: "Paul Tol 色盲安全",
  muted: "柔和 muted",
  high_vis: "高可视 high-vis",
  pastel: "柔和 pastel",
  print_bw: "灰度打印",
};

export const DEFAULT_CHART_STYLE: ChartStyleConfig = {
  preset: "nature",
  columns: 1,
  palette: "nature",
  show_grid: false,
  legend_frame: false,
  export_formats: ["png", "svg", "pdf"],
  use_markers: false,
};

/** registry 全局样式字段默认值 */
export function defaultStyleFieldValues(
  fields: ChartRegistryField[] | undefined,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const f of fields ?? []) {
    if (f.default !== undefined) {
      out[f.key] = f.default;
    }
  }
  return out;
}

export function buildChartStylePayload(
  values: Record<string, string | number | boolean>,
): ChartStyleConfig {
  const style: ChartStyleConfig = {};
  const preset = values.preset ?? values.style_preset;
  if (typeof preset === "string" && preset) {
    style.preset = preset as ChartStylePreset;
  }
  if (values.palette && typeof values.palette === "string") {
    style.palette = values.palette as ChartPalette;
  }
  if (values.font_size !== undefined && values.font_size !== "") {
    style.font_size = Number(values.font_size);
  }
  if (values.title_font_size !== undefined && values.title_font_size !== "") {
    style.title_font_size = Number(values.title_font_size);
  }
  if (values.dpi !== undefined && values.dpi !== "") {
    style.dpi = Number(values.dpi);
  }
  if (values.fig_width !== undefined && values.fig_width !== "") {
    style.fig_width = Number(values.fig_width);
  }
  if (values.fig_height !== undefined && values.fig_height !== "") {
    style.fig_height = Number(values.fig_height);
  }
  if (values.panel_label && typeof values.panel_label === "string") {
    style.panel_label = values.panel_label;
  }
  if (values.legend_loc && typeof values.legend_loc === "string") {
    style.legend_loc = values.legend_loc;
  }
  if (values.show_grid !== undefined) {
    style.show_grid = values.show_grid === true || values.show_grid === "true";
  }
  if (values.legend_frame !== undefined) {
    style.legend_frame = values.legend_frame === true || values.legend_frame === "true";
  }
  if (values.show_values !== undefined) {
    style.show_values = values.show_values === true || values.show_values === "true";
  }
  if (values.bar_edge !== undefined) {
    style.bar_edge = values.bar_edge === true || values.bar_edge === "true";
  }
  if (values.use_markers !== undefined) {
    style.use_markers = values.use_markers === true || values.use_markers === "true";
  }
  if (values.axes_linewidth !== undefined && values.axes_linewidth !== "") {
    style.axes_linewidth = Number(values.axes_linewidth);
  }
  if (values.x_tick_rotation !== undefined && values.x_tick_rotation !== "") {
    style.x_tick_rotation = Number(values.x_tick_rotation);
  }
  if (values.y_sci_notation !== undefined) {
    style.y_sci_notation = values.y_sci_notation === true || values.y_sci_notation === "true";
  }
  if (values.columns !== undefined && values.columns !== "") {
    style.columns = Number(values.columns) >= 2 ? 2 : 1;
  }
  const exports = values.export_formats;
  if (typeof exports === "string" && exports) {
    style.export_formats = exports.split(",").map((s) => s.trim()) as ChartExportFormat[];
  }
  return style;
}
