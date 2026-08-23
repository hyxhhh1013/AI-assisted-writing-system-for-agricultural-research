/**
 * 机理图确定性质检 — FIG-MECH-QA。
 * 主尺在 Spec（节点/边/白名单），不把 VLM 当主质检。
 */

export type MechanismQaLayer = "L0" | "L2" | "L4" | "L5";

export type MechanismQaAction = "block" | "repair" | "pass" | "warn";

export type MechanismQaVerdict = "block" | "repair" | "pass";

export const MECHANISM_QA_CODES = [
  "english_placeholder",
  "upload_placeholder",
  "empty_panel",
  "node_overload",
  "structure_too_simple",
  "panel_imbalance",
  "missing_edge_condition",
  "claim_on_figure",
  "duplicate_text",
] as const;

export type MechanismQaCode = (typeof MECHANISM_QA_CODES)[number];

export interface MechanismQaFinding {
  code: MechanismQaCode | (string & {});
  layer: MechanismQaLayer;
  action: MechanismQaAction;
  message: string;
}

export interface MechanismQaReport {
  verdict: MechanismQaVerdict;
  findings: MechanismQaFinding[];
}

export function mechanismVerdictFromFindings(
  findings: readonly MechanismQaFinding[],
): MechanismQaVerdict {
  if (findings.some((f) => f.action === "block")) return "block";
  if (findings.some((f) => f.action === "repair")) return "repair";
  return "pass";
}

export function buildMechanismQaReport(
  findings: MechanismQaFinding[],
): MechanismQaReport {
  return {
    verdict: mechanismVerdictFromFindings(findings),
    findings,
  };
}
