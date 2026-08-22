/**
 * FIG-QA-007：Agent 出图 extras 白名单。
 * 模型不得再把 matplotlib rc / 刊宽 / tight_layout 塞进 configJson。
 */

export const AGENT_CHART_EXTRA_KEYS = [
  "significance",
  "dual_y",
  "donut",
  "show_legend",
  "heatmap_annotate",
  "diverging",
  "cmap",
  "annotate_format",
  "show_trendline",
  "radar_min",
  "radar_max",
  "forest_ref",
  "offset",
  "normalize",
  "series_labels",
  "show_values",
  "show_shadow",
  "unitless",
] as const;

export type AgentChartExtraKey = (typeof AGENT_CHART_EXTRA_KEYS)[number];

const ALLOWED = new Set<string>(AGENT_CHART_EXTRA_KEYS);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseJsonObject(raw: unknown, label: string): { obj?: Record<string, unknown>; error?: string } {
  if (raw == null || raw === "") return {};
  if (isRecord(raw)) return { obj: raw };
  if (typeof raw !== "string") return { error: `${label} 必须是 JSON 对象字符串` };
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return { error: `${label} 必须是 JSON 对象` };
    return { obj: parsed };
  } catch {
    return { error: `${label} 必须是合法 JSON` };
  }
}

function parseJsonValue(raw: unknown, label: string): { value?: unknown; error?: string } {
  if (raw == null || raw === "") return {};
  if (typeof raw !== "string") return { value: raw };
  try {
    return { value: JSON.parse(raw) };
  } catch {
    return { error: `${label} 必须是合法 JSON` };
  }
}

export interface LiftedAgentChartExtras {
  extras: Record<string, unknown>;
  dropped: string[];
  error?: string;
}

/**
 * 从工具参数抽出可进 Spec / Python 的 extras。
 * `significanceJson` 优先于 `configJson.significance`。
 * 未知键（含 fig_width / dpi / tight_layout / style）记入 dropped，不进入 extras。
 */
export function liftAgentChartExtras(input: {
  configJson?: unknown;
  significanceJson?: unknown;
}): LiftedAgentChartExtras {
  const fromConfig = parseJsonObject(input.configJson, "configJson");
  if (fromConfig.error) return { extras: {}, dropped: [], error: fromConfig.error };

  const extras: Record<string, unknown> = {};
  const dropped: string[] = [];
  const src = fromConfig.obj ?? {};
  for (const [key, value] of Object.entries(src)) {
    if (ALLOWED.has(key)) extras[key] = value;
    else dropped.push(key);
  }

  const sig = parseJsonValue(input.significanceJson, "significanceJson");
  if (sig.error) return { extras: {}, dropped, error: sig.error };
  if (sig.value !== undefined) extras.significance = sig.value;

  return { extras, dropped };
}
