/**
 * 论文质量收口看板的数据层（纯函数，无 UI 依赖，可单测）。
 * 聚合 5 个质量信号：节完整度 / 摘要 / 引用硬检 / 审查 / 文风质检。
 * WRITE-QA-006：第 5 信号避免「四灯全绿、正文仍空话」。
 */
import type { WritingQaReport } from "@/contracts/writing-qa";
import { evaluateSectionWritingQa } from "@/lib/agent/writing-qa-run";
import { evaluateDraftCoverage } from "@/lib/draft-coverage";

export type QualitySignalKey = "coverage" | "abstract" | "citation" | "review" | "prose";
export type QualitySignalStatus = "ok" | "warn" | "missing";

export interface QualitySignal {
  key: QualitySignalKey;
  status: QualitySignalStatus;
  label: string;
  detail: string;
}

export interface QualityClosureInput {
  sections: Record<string, string>;
  mode?: "review" | "research";
  language?: "zh" | "en";
  /** 引用硬检结果：true 通过 / false 未过 / null 未知（未拉取） */
  citationPassed?: boolean | null;
  /** 是否已跑过审查轮次 */
  reviewDone?: boolean;
  /** 最近一次写节 qaReport；缺省则扫已写入章节 */
  lastProseQa?: WritingQaReport | null;
}

export interface QualityClosureResult {
  signals: QualitySignal[];
  okCount: number;
  total: number;
  readyToClose: boolean;
  summary: string;
}

const MAX_PROSE_FINDINGS = 12;

function asSectionText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** 对已写入各节跑确定性 QA，聚合为全文 prose 信号。 */
export function evaluateProjectProseQa(
  sections: Record<string, string> | undefined,
): WritingQaReport | null {
  const entries = Object.entries(sections ?? {})
    .map(([key, value]) => [key, asSectionText(value)] as const)
    .filter(([, text]) => text.trim().length > 0);
  if (entries.length === 0) return null;
  const findings: WritingQaReport["findings"] = [];
  let charCount = 0;
  for (const [key, text] of entries) {
    let report: WritingQaReport;
    try {
      report = evaluateSectionWritingQa({ text, sectionKey: key });
    } catch {
      continue;
    }
    charCount += report.charCount ?? text.length;
    for (const f of report.findings) {
      if (findings.length >= MAX_PROSE_FINDINGS) break;
      findings.push({
        ...f,
        message: `[${key}] ${f.message}`,
      });
    }
  }
  return {
    verdict: findings.some((f) => f.action === "block")
      ? "block"
      : findings.some((f) => f.action === "repair")
        ? "repair"
        : "pass",
    findings,
    charCount,
  };
}

function proseSignal(
  report: WritingQaReport | null,
): QualitySignal {
  if (!report) {
    return {
      key: "prose",
      status: "missing",
      label: "文风质检",
      detail: "未写正文",
    };
  }
  const repair = report.findings.filter((f) => f.action === "repair" || f.action === "block");
  if (report.verdict === "block") {
    return {
      key: "prose",
      status: "warn",
      label: "文风质检",
      detail: `不可写回：${repair.map((f) => f.code).slice(0, 3).join("、") || "block"}`,
    };
  }
  if (report.verdict === "repair") {
    return {
      key: "prose",
      status: "warn",
      label: "文风质检",
      detail: `${repair.length} 条待修补（${repair.map((f) => f.code).slice(0, 3).join("、")}）`,
    };
  }
  const warns = report.findings.filter((f) => f.action === "warn");
  return {
    key: "prose",
    status: "ok",
    label: "文风质检",
    detail: warns.length > 0 ? `通过（${warns.length} 条提示）` : "通过",
  };
}

export function buildQualityClosure(input: QualityClosureInput): QualityClosureResult {
  const sectionChars: Record<string, number> = {};
  for (const [key, content] of Object.entries(input.sections ?? {})) {
    sectionChars[key] = asSectionText(content).length;
  }

  const coverage = evaluateDraftCoverage({
    mode: input.mode ?? "research",
    language: input.language ?? "zh",
    sectionChars,
  });

  const signals: QualitySignal[] = [];

  const coverageOk =
    coverage.requiredGaps.length === 0 && coverage.thinKeys.length === 0;
  signals.push({
    key: "coverage",
    status: coverageOk ? "ok" : "warn",
    label: "节完整度",
    detail: coverageOk
      ? `必写 ${coverage.okRequiredCount}/${coverage.requiredCount} 全达标`
      : `必写 ${coverage.okRequiredCount}/${coverage.requiredCount}${coverage.requiredGaps.length > 0 ? `，缺 ${coverage.requiredGaps.join("、")}` : ""}${coverage.thinKeys.length > 0 ? `，偏薄 ${coverage.thinKeys.join("、")}` : ""}`,
  });

  const abs = coverage.sections.find((s) => s.key === "abstract");
  const absStatus = abs?.status ?? "empty";
  signals.push({
    key: "abstract",
    status: absStatus === "ok" ? "ok" : absStatus === "thin" ? "warn" : "missing",
    label: "摘要",
    detail:
      absStatus === "ok"
        ? `${abs?.chars ?? 0} 字`
        : absStatus === "thin"
          ? `${abs?.chars ?? 0} 字（偏薄）`
          : "未写",
  });

  signals.push({
    key: "citation",
    status:
      input.citationPassed === true
        ? "ok"
        : input.citationPassed === false
          ? "warn"
          : "missing",
    label: "引用硬检",
    detail:
      input.citationPassed === true
        ? "通过"
        : input.citationPassed === false
          ? "未通过"
          : "未知",
  });

  signals.push({
    key: "review",
    status: input.reviewDone ? "ok" : "missing",
    label: "审查",
    detail: input.reviewDone ? "已审查" : "未审查",
  });

  const prose = input.lastProseQa === undefined
    ? evaluateProjectProseQa(input.sections)
    : input.lastProseQa;
  signals.push(proseSignal(prose));

  const okCount = signals.filter((s) => s.status === "ok").length;
  const total = signals.length;
  const missing = signals.filter((s) => s.status === "missing");
  const readyToClose = okCount === total && coverage.requiredGaps.length === 0;

  let summary: string;
  if (readyToClose) {
    summary = "质量收口就绪，可导出";
  } else if (missing.length === 0) {
    summary = "主体已达标，仍有可优化项";
  } else {
    summary = `还差：${missing.map((s) => s.label).join("、")}`;
  }

  return { signals, okCount, total, readyToClose, summary };
}
