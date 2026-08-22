/**
 * FIG-QA-005：qaReport findings → ChartSpec 补丁（纯函数）。
 * 与 scripts/charts/chart_spec_patches.py 补丁表对齐。
 */
import type { ChartQaFinding } from "@/contracts/chart-qa";
import type { ChartLegendPlacement, ChartSpecLayout, ChartSpecV1 } from "@/contracts/chart-spec";
import { hasAxisUnit, parseChartSpec } from "@/contracts/chart-spec";

const COL_UNIT_RE = /^(.+?)\s*[（(]([^）)]+)[）)]\s*$/;

export interface ChartSpecPatch {
  code: string;
  path: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export interface ApplyChartSpecPatchesResult {
  spec: ChartSpecV1;
  patches: ChartSpecPatch[];
}

function cloneSpec(spec: ChartSpecV1): ChartSpecV1 {
  return JSON.parse(JSON.stringify(spec)) as ChartSpecV1;
}

function ensureLayout(spec: ChartSpecV1): ChartSpecLayout {
  if (!spec.layout) {
    spec.layout = { legend: "auto" };
  }
  return spec.layout;
}

function unitFromName(name: string): { base: string; unit: string } | null {
  const m = name.trim().match(COL_UNIT_RE);
  if (!m) return null;
  return { base: m[1].trim(), unit: m[2].trim() };
}

function yLabelFromColumns(spec: ChartSpecV1): string | null {
  const names = [
    ...(spec.data.columns?.y ?? []),
    ...(spec.data.datasets?.map((d) => d.label) ?? []),
  ];
  for (const name of names) {
    const parsed = unitFromName(name);
    if (parsed) return `${parsed.base} (${parsed.unit})`;
  }
  return null;
}

function nextLegend(current: ChartLegendPlacement | undefined): ChartLegendPlacement | null {
  if (!current || current === "auto") return "outer-right";
  if (current === "outer-right") return "outer-bottom";
  return null;
}

function addPatch(
  patches: ChartSpecPatch[],
  code: string,
  path: string,
  before: ChartSpecPatch["before"],
  after: ChartSpecPatch["after"],
): void {
  if (before === after) return;
  patches.push({ code, path, before, after });
}

/** 只消费 repair（以及可回填的 missing_unit block） */
export function isPatchableFinding(finding: ChartQaFinding): boolean {
  if (finding.action === "repair") return true;
  return finding.action === "block" && finding.code === "missing_unit";
}

export function applyChartSpecPatches(
  spec: ChartSpecV1,
  findings: readonly ChartQaFinding[],
): ApplyChartSpecPatchesResult {
  const next = cloneSpec(spec);
  const patches: ChartSpecPatch[] = [];
  const codes = new Set(findings.filter(isPatchableFinding).map((f) => f.code));

  if (codes.has("label_overlap") || codes.has("annotation_clipped")) {
    const layout = ensureLayout(next);
    const before = layout.xTickRotation ?? 0;
    if (before < 35) {
      layout.xTickRotation = 35;
      addPatch(patches, codes.has("label_overlap") ? "label_overlap" : "annotation_clipped", "layout.xTickRotation", before, 35);
    }
  }

  if (codes.has("legend_covers_data")) {
    const layout = ensureLayout(next);
    const after = nextLegend(layout.legend);
    if (after) {
      addPatch(patches, "legend_covers_data", "layout.legend", layout.legend, after);
      layout.legend = after;
    }
  }

  if (codes.has("missing_unit") && !next.encoding.unitless && !hasAxisUnit(next.encoding.yLabel)) {
    const filled = yLabelFromColumns(next);
    if (filled) {
      addPatch(patches, "missing_unit", "encoding.yLabel", next.encoding.yLabel, filled);
      next.encoding.yLabel = filled;
    }
  }

  if (codes.has("width_off_spec")) {
    const cols = next.journal.columns === 2 ? 2 : 1;
    addPatch(patches, "width_off_spec", "journal.columns", next.journal.columns, cols);
    next.journal.columns = cols;
  }

  const parsed = parseChartSpec(next);
  return { spec: parsed ?? spec, patches };
}
