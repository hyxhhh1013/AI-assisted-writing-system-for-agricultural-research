import type { FigureDef } from "@/services/figures";

/** XRD 侧栏分组：常用 vs 高级 */
export type XrdFigureTier = "common" | "advanced";

export const XRD_FIGURE_TIERS: Record<string, XrdFigureTier> = {
  xrd_workflow: "common",
  xrd_stack: "common",
  xrd_peakfit: "common",
  xrd_xps: "common",
  xrd_scherrer: "common",
  xrd_simulate: "advanced",
  xrd_unitcell: "advanced",
  xrd_amorphous: "advanced",
  xrd_bragg: "advanced",
};

const COMMON_ORDER = ["xrd_workflow", "xrd_stack", "xrd_peakfit", "xrd_xps", "xrd_scherrer"] as const;
const ADVANCED_ORDER = ["xrd_simulate", "xrd_unitcell", "xrd_amorphous", "xrd_bragg"] as const;

function sortByOrder(figures: FigureDef[], order: readonly string[]): FigureDef[] {
  const rank = new Map(order.map((id, i) => [id, i]));
  return [...figures].sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));
}

export function groupXrdFigures(figures: FigureDef[]): {
  common: FigureDef[];
  advanced: FigureDef[];
  other: FigureDef[];
} {
  const common: FigureDef[] = [];
  const advanced: FigureDef[] = [];
  const other: FigureDef[] = [];

  for (const fig of figures) {
    const tier = XRD_FIGURE_TIERS[fig.id];
    if (tier === "common") common.push(fig);
    else if (tier === "advanced") advanced.push(fig);
    else other.push(fig);
  }

  return {
    common: sortByOrder(common, COMMON_ORDER),
    advanced: sortByOrder(advanced, ADVANCED_ORDER),
    other,
  };
}

/** 进入 XRD 分类时的默认工具 */
export const XRD_DEFAULT_FIGURE_ID = "xrd_workflow";
