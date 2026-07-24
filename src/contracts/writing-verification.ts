/**
 * ENG-PR-082 — 写作管道 Verifier 结构化报告
 * 与人控 audit_only / full 模式及 Refiner 选择性修正共用。
 */

export const VERIFICATION_ISSUE_TYPES = [
  "overclaim",
  "citation_error",
  "citation_fake",
  "results_discussion_mix",
  "data_claim_mismatch",
  "terminology",
  "vague_expression",
  "verbatim_copy",
  "data_attribution",
  "other",
] as const;

export type VerificationIssueType = (typeof VERIFICATION_ISSUE_TYPES)[number];

export type VerificationSeverity = "high" | "medium" | "low";

export interface VerificationIssue {
  id: string;
  type: VerificationIssueType;
  severity: VerificationSeverity;
  /** 可选：模型常给不准，解析时放宽 */
  location?: { offset: number; length: number };
  originalText: string;
  suggestion: string;
  evidence?: string;
}

export interface VerificationReport {
  passed: boolean;
  summary: string;
  issues: VerificationIssue[];
  /** 原始模型文本（解析失败或兼容） */
  rawText?: string;
}

const TYPE_SET = new Set<string>(VERIFICATION_ISSUE_TYPES);
const SEVERITY_SET = new Set<string>(["high", "medium", "low"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function extractJsonObject(rawText: string): unknown {
  const trimmed = rawText.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenced) return JSON.parse(fenced[1].trim());
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error("no json object");
  }
}

function normalizeIssue(raw: unknown, index: number): VerificationIssue | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const originalText = String(obj.originalText ?? obj.original ?? "").trim();
  const suggestion = String(obj.suggestion ?? obj.fix ?? "").trim();
  if (!originalText && !suggestion) return null;

  let type = String(obj.type ?? "other");
  if (!TYPE_SET.has(type)) type = "other";

  let severity = String(obj.severity ?? "medium");
  if (!SEVERITY_SET.has(severity)) severity = "medium";

  const loc = asRecord(obj.location);
  const location =
    loc
    && typeof loc.offset === "number"
    && typeof loc.length === "number"
      ? { offset: loc.offset, length: loc.length }
      : undefined;

  return {
    id: String(obj.id ?? `v${index + 1}`),
    type: type as VerificationIssueType,
    severity: severity as VerificationSeverity,
    location,
    originalText: originalText || "（未指出原文片段）",
    suggestion: suggestion || "请按学术规范改写该处",
    evidence: obj.evidence != null ? String(obj.evidence) : undefined,
  };
}

/** 将模型输出解析为结构化报告；失败则降级为文本报告 */
export function parseVerificationReport(rawText: string): VerificationReport {
  const text = rawText.trim();
  if (!text) {
    return { passed: true, summary: "无核查输出", issues: [], rawText: text };
  }

  const upper = text.toUpperCase();
  if (upper.startsWith("PASS") && !text.includes("{")) {
    return {
      passed: true,
      summary: text.slice(0, 500),
      issues: [],
      rawText: text,
    };
  }

  try {
    const parsed = extractJsonObject(text);
    const obj = asRecord(parsed);
    if (!obj) throw new Error("not object");

    const issuesRaw = Array.isArray(obj.issues) ? obj.issues : [];
    const issues = issuesRaw
      .map((item, i) => normalizeIssue(item, i))
      .filter((x): x is VerificationIssue => x != null);

    const passedExplicit = obj.passed === true || obj.passed === "true";
    const passed =
      passedExplicit
      || (issues.length === 0 && (obj.passed !== false && obj.passed !== "false"));

    const summary =
      String(obj.summary ?? "").trim()
      || (passed ? "核查通过" : `发现 ${issues.length} 处问题`);

    return {
      passed: passed && issues.length === 0,
      summary,
      issues,
      rawText: text,
    };
  } catch {
    const looksPass = upper.startsWith("PASS");
    return {
      passed: looksPass,
      summary: looksPass ? text.slice(0, 500) : "结构化解析失败，已保留文本报告",
      issues: [],
      rawText: text,
    };
  }
}

export function hasActionableVerificationIssues(
  report: VerificationReport,
  minSeverity: VerificationSeverity = "medium",
): boolean {
  if (report.passed && report.issues.length === 0) return false;
  const rank = { high: 3, medium: 2, low: 1 };
  const min = rank[minSeverity];
  return report.issues.some((i) => rank[i.severity] >= min);
}

/** 供 Refiner 使用的意见文本；可按 selectedIssueIds 过滤 */
export function formatVerificationIssuesForRefiner(
  report: VerificationReport,
  selectedIssueIds?: string[] | null,
): string {
  let issues = report.issues;
  if (selectedIssueIds && selectedIssueIds.length > 0) {
    const set = new Set(selectedIssueIds);
    issues = issues.filter((i) => set.has(i.id));
  } else {
    issues = issues.filter((i) => i.severity === "high" || i.severity === "medium");
  }

  if (issues.length === 0) {
    return report.rawText?.trim() || report.summary;
  }

  const lines = [
    `核查摘要：${report.summary}`,
    `请仅按下列 ${issues.length} 条意见修正（不要无关改写）：`,
    ...issues.map(
      (i, idx) =>
        `${idx + 1}. [${i.severity}/${i.type}] id=${i.id}\n` +
        `   原文：${i.originalText}\n` +
        `   建议：${i.suggestion}` +
        (i.evidence ? `\n   依据：${i.evidence}` : ""),
    ),
  ];
  return lines.join("\n");
}
