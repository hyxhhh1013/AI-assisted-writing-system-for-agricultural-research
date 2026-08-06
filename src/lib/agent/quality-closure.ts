/**
 * 论文质量收口看板的数据层（纯函数，无 UI 依赖，可单测）。
 * 聚合 4 个质量信号：节完整度 / 摘要 / 引用硬检 / 审查。
 * 对应 academic-paper skill 的「收口」语义：全部达标后可导出。
 */
import { evaluateDraftCoverage } from "@/lib/draft-coverage";

export type QualitySignalKey = "coverage" | "abstract" | "citation" | "review";
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
}

export interface QualityClosureResult {
  signals: QualitySignal[];
  okCount: number;
  total: number;
  readyToClose: boolean;
  summary: string;
}

export function buildQualityClosure(input: QualityClosureInput): QualityClosureResult {
  const sectionChars: Record<string, number> = {};
  for (const [key, content] of Object.entries(input.sections ?? {})) {
    sectionChars[key] = (content ?? "").length;
  }

  const coverage = evaluateDraftCoverage({
    mode: input.mode ?? "research",
    language: input.language ?? "zh",
    sectionChars,
  });

  const signals: QualitySignal[] = [];

  // 节完整度：必写节无缺口且无偏薄 → ok
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

  // 摘要：复用 coverage 的 abstract 节状态
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

  // 引用硬检
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

  // 审查
  signals.push({
    key: "review",
    status: input.reviewDone ? "ok" : "missing",
    label: "审查",
    detail: input.reviewDone ? "已审查" : "未审查",
  });

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
