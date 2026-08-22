/**
 * 图表确定性质检报告 — FIG-QA-001。
 * 与 scripts/charts 回传的 styleValidation / 后续 qa_report.py 对齐。
 * 中文「需重生成 / 建议精修 / 可接受」只做展示；机器认 findings[].code。
 */

export type ChartQaLayer = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

/** block=不可入库；repair=改 spec 再渲染；pass/warn=可入库 */
export type ChartQaAction = "block" | "repair" | "pass" | "warn";

export type ChartQaVerdict = "block" | "repair" | "pass";

/** 规划表内已知 code；未知 code 仍允许（前向兼容 Python 新检查） */
export const CHART_QA_CODES = [
  "missing_unit",
  "error_col_unpaired",
  "significance_oob",
  "width_missing",
  "width_off_spec",
  "font_too_small",
  "font_small",
  "dpi_low",
  "linewidth_thin",
  "height_tall",
  "figsize_mismatch",
  "label_overlap",
  "legend_covers_data",
  "annotation_clipped",
  "cjk_tofu",
  "grayscale_adjacent",
  "palette_soft",
  "width",
  "font",
  "dpi",
  "linewidth",
] as const;

export type ChartQaCode = (typeof CHART_QA_CODES)[number] | (string & {});

export interface ChartQaFinding {
  code: string;
  layer: ChartQaLayer;
  action: ChartQaAction;
  message: string;
}

export interface ChartQaReport {
  verdict: ChartQaVerdict;
  findings: ChartQaFinding[];
  preset?: string;
  columns?: number;
  targetWidthIn?: number;
}

/** 旧 styleValidation 形状（chart-runner / services/charts），升格用 */
export interface ChartStyleValidationLike {
  ok: boolean;
  preset?: string;
  columns?: number;
  target_width_in?: number;
  checks?: Array<{ level: string; code: string; message: string }>;
}

const STYLE_CODE_META: Record<string, { layer: ChartQaLayer; fail: ChartQaAction; warn: ChartQaAction }> = {
  width_missing: { layer: "L1", fail: "block", warn: "repair" },
  width_off_spec: { layer: "L1", fail: "repair", warn: "repair" },
  font_too_small: { layer: "L1", fail: "block", warn: "block" },
  font_small: { layer: "L1", fail: "warn", warn: "warn" },
  dpi_low: { layer: "L1", fail: "warn", warn: "warn" },
  linewidth_thin: { layer: "L1", fail: "warn", warn: "warn" },
  height_tall: { layer: "L1", fail: "warn", warn: "warn" },
  figsize_mismatch: { layer: "L1", fail: "warn", warn: "warn" },
  palette_soft: { layer: "L3", fail: "warn", warn: "warn" },
  grayscale_adjacent: { layer: "L3", fail: "warn", warn: "warn" },
  missing_unit: { layer: "L0", fail: "block", warn: "repair" },
  error_col_unpaired: { layer: "L0", fail: "block", warn: "block" },
  significance_oob: { layer: "L0", fail: "block", warn: "block" },
  label_overlap: { layer: "L2", fail: "repair", warn: "repair" },
  legend_covers_data: { layer: "L2", fail: "repair", warn: "repair" },
  annotation_clipped: { layer: "L2", fail: "repair", warn: "repair" },
  cjk_tofu: { layer: "L3", fail: "block", warn: "block" },
};

function actionFromStyleCheck(code: string, level: string): ChartQaAction {
  const meta = STYLE_CODE_META[code];
  const lv = level.toLowerCase();
  if (lv === "pass") return "pass";
  if (meta) return lv === "fail" ? meta.fail : meta.warn;
  if (lv === "fail") return "block";
  if (lv === "warn") return "warn";
  return "pass";
}

function layerFromStyleCheck(code: string): ChartQaLayer {
  return STYLE_CODE_META[code]?.layer ?? "L1";
}

export function verdictFromFindings(findings: readonly ChartQaFinding[]): ChartQaVerdict {
  if (findings.some((f) => f.action === "block")) return "block";
  if (findings.some((f) => f.action === "repair")) return "repair";
  return "pass";
}

export function summarizeChartQa(report: ChartQaReport): {
  hasBlock: boolean;
  hasRepair: boolean;
  blockCodes: string[];
  repairCodes: string[];
} {
  const blockCodes = report.findings.filter((f) => f.action === "block").map((f) => f.code);
  const repairCodes = report.findings.filter((f) => f.action === "repair").map((f) => f.code);
  return {
    hasBlock: blockCodes.length > 0,
    hasRepair: repairCodes.length > 0,
    blockCodes,
    repairCodes,
  };
}

/** 对用户展示的中文标签（不参与门禁） */
export function chartQaVerdictLabel(verdict: ChartQaVerdict): string {
  if (verdict === "block") return "不可入库";
  if (verdict === "repair") return "可自动修补";
  return "可接受";
}

export function liftStyleValidation(raw: ChartStyleValidationLike | null | undefined): ChartQaReport {
  if (!raw) {
    return { verdict: "pass", findings: [] };
  }
  const findings: ChartQaFinding[] = [];
  for (const check of raw.checks ?? []) {
    if (!check || typeof check.code !== "string") continue;
    findings.push({
      code: check.code,
      layer: layerFromStyleCheck(check.code),
      action: actionFromStyleCheck(check.code, String(check.level ?? "")),
      message: typeof check.message === "string" ? check.message : check.code,
    });
  }
  let verdict = verdictFromFindings(findings);
  if (!raw.ok && verdict === "pass") {
    verdict = "block";
    findings.push({
      code: "width_missing",
      layer: "L1",
      action: "block",
      message: "styleValidation.ok=false 但未给出 fail 项",
    });
  }
  return {
    verdict,
    findings,
    preset: raw.preset,
    columns: raw.columns,
    targetWidthIn: raw.target_width_in,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseChartQaReport(raw: unknown): ChartQaReport | null {
  if (!isRecord(raw)) return null;
  const findingsRaw = raw.findings;
  if (!Array.isArray(findingsRaw)) return null;
  const findings: ChartQaFinding[] = [];
  for (const item of findingsRaw) {
    if (!isRecord(item)) continue;
    if (typeof item.code !== "string" || typeof item.message !== "string") continue;
    const layer = item.layer;
    const action = item.action;
    if (layer !== "L0" && layer !== "L1" && layer !== "L2" && layer !== "L3" && layer !== "L4" && layer !== "L5") {
      continue;
    }
    if (action !== "block" && action !== "repair" && action !== "pass" && action !== "warn") {
      continue;
    }
    findings.push({ code: item.code, layer, action, message: item.message });
  }
  const verdictRaw = raw.verdict;
  const verdict: ChartQaVerdict =
    verdictRaw === "block" || verdictRaw === "repair" || verdictRaw === "pass"
      ? verdictRaw
      : verdictFromFindings(findings);
  return {
    verdict,
    findings,
    preset: typeof raw.preset === "string" ? raw.preset : undefined,
    columns: typeof raw.columns === "number" ? raw.columns : undefined,
    targetWidthIn:
      typeof raw.targetWidthIn === "number"
        ? raw.targetWidthIn
        : typeof raw.target_width_in === "number"
          ? raw.target_width_in
          : undefined,
  };
}
