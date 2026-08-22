/**
 * 写作确定性质检报告 — WRITE-QA-001。
 * 中文「自动核查通过 / 已按意见修正」只做展示；机器认 findings[].code。
 * 热路径 QA 在 003；本文件只做契约与 WQC 升格。
 */

export type WritingQaLayer = "L0" | "L1" | "L2" | "L3" | "L4" | "L5";

/** block=不可写回；repair=改草稿/spec 再检；pass/warn=可写回 */
export type WritingQaAction = "block" | "repair" | "pass" | "warn";

export type WritingQaVerdict = "block" | "repair" | "pass";

/** 规划表内已知 code；未知 code 仍允许（前向兼容 003+ 新检查） */
export const WRITING_QA_CODES = [
  "number_not_in_claims",
  "cite_oob",
  "cite_semantic_mismatch",
  "results_discussion_bleed",
  "abstract_has_cite",
  "embedded_bib",
  "md_heading",
  "throat_clear",
  "hollow_phrase",
  "overclaim",
  "para_monotone",
  "sentence_monotone",
  "blueprint_claim_uncovered",
  "evidence_unbound",
  "intro_gap_missing",
  "review_as_experiment",
  "results_no_quantity",
] as const;

export type WritingQaCode = (typeof WRITING_QA_CODES)[number] | (string & {});

export interface WritingQaFinding {
  code: string;
  layer: WritingQaLayer;
  action: WritingQaAction;
  message: string;
  /** 命中次数或段落数 */
  count?: number;
  /** 原文片段，供定向 refine */
  examples?: string[];
}

export interface WritingQaReport {
  verdict: WritingQaVerdict;
  findings: WritingQaFinding[];
  sectionKey?: string;
  charCount?: number;
}

/** 现有 WQC（writing-quality.ts）形状，升格用，不从 lib 反引 */
export interface WritingQualityFindingLike {
  rule: string;
  severity?: string;
  count?: number;
  message: string;
  examples?: string[];
  severe?: boolean;
}

const WQC_META: Record<
  string,
  { code: string; layer: WritingQaLayer; action: WritingQaAction }
> = {
  throat_clear: { code: "throat_clear", layer: "L2", action: "repair" },
  connective_overuse: { code: "hollow_phrase", layer: "L2", action: "repair" },
  overclaim: { code: "overclaim", layer: "L2", action: "repair" },
  para_variance: { code: "para_monotone", layer: "L2", action: "warn" },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function verdictFromWritingFindings(
  findings: readonly WritingQaFinding[],
): WritingQaVerdict {
  if (findings.some((f) => f.action === "block")) return "block";
  if (findings.some((f) => f.action === "repair")) return "repair";
  return "pass";
}

/** WRITE-QA-006：只有 block 不写回；repair/pass/warn 仍可 persist */
export function shouldPersistWritingDraft(report: WritingQaReport): boolean {
  return report.verdict !== "block";
}

/**
 * write_section 是否已收口（已写回，或质检明确拦截）。
 * 拦截也算「这一次写完了」，避免 Agent 把 persisted=null 当成失败整节重写。
 */
export function isWriteSectionSettled(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const row = data as { persisted?: unknown; blocked?: unknown };
  if (row.persisted != null) return true;
  return row.blocked === true;
}

export function summarizeWritingQa(report: WritingQaReport): {
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
export function writingQaVerdictLabel(verdict: WritingQaVerdict): string {
  if (verdict === "block") return "不可写回";
  if (verdict === "repair") return "可自动修补";
  return "可接受";
}

/**
 * 升格现有 checkWritingQuality 结果。
 * 001 不改变 WQC 行为；003 再挂热路径。
 */
export function liftWritingQualityFindings(
  findings: readonly WritingQualityFindingLike[] | null | undefined,
  extra?: { sectionKey?: string; charCount?: number },
): WritingQaReport {
  const out: WritingQaFinding[] = [];
  for (const item of findings ?? []) {
    if (!item || typeof item.rule !== "string") continue;
    const meta = WQC_META[item.rule] ?? {
      code: item.rule,
      layer: "L2" as const,
      action: "warn" as const,
    };
    const finding: WritingQaFinding = {
      code: meta.code,
      layer: meta.layer,
      action: meta.action,
      message: typeof item.message === "string" ? item.message : meta.code,
    };
    if (typeof item.count === "number") finding.count = item.count;
    if (item.examples?.length) finding.examples = item.examples.slice(0, 3);
    out.push(finding);
  }
  return {
    verdict: verdictFromWritingFindings(out),
    findings: out,
    sectionKey: extra?.sectionKey,
    charCount: extra?.charCount,
  };
}

export function parseWritingQaReport(raw: unknown): WritingQaReport | null {
  if (!isRecord(raw)) return null;
  const findingsRaw = raw.findings;
  if (!Array.isArray(findingsRaw)) return null;
  const findings: WritingQaFinding[] = [];
  for (const item of findingsRaw) {
    if (!isRecord(item)) continue;
    if (typeof item.code !== "string" || typeof item.message !== "string") continue;
    const layer = item.layer;
    const action = item.action;
    if (
      layer !== "L0"
      && layer !== "L1"
      && layer !== "L2"
      && layer !== "L3"
      && layer !== "L4"
      && layer !== "L5"
    ) {
      continue;
    }
    if (action !== "block" && action !== "repair" && action !== "pass" && action !== "warn") {
      continue;
    }
    const finding: WritingQaFinding = { code: item.code, layer, action, message: item.message };
    if (typeof item.count === "number") finding.count = item.count;
    if (Array.isArray(item.examples)) {
      finding.examples = item.examples.filter((e): e is string => typeof e === "string").slice(0, 3);
    }
    findings.push(finding);
  }
  const verdictRaw = raw.verdict;
  const verdict: WritingQaVerdict =
    verdictRaw === "block" || verdictRaw === "repair" || verdictRaw === "pass"
      ? verdictRaw
      : verdictFromWritingFindings(findings);
  return {
    verdict,
    findings,
    sectionKey: typeof raw.sectionKey === "string" ? raw.sectionKey : undefined,
    charCount: typeof raw.charCount === "number" ? raw.charCount : undefined,
  };
}
