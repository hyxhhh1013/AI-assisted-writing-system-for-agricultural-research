/**
 * 稿面扫描报告 — 写后/inspect 共用。确定性规则，不调 LLM。
 * 自进化仍靠 harvest→golden；本契约只保证 Agent 能自己看见洞。
 */

export type ManuscriptAuditSeverity = "block" | "repair" | "warn";

export interface ManuscriptAuditIssue {
  code: string;
  severity: ManuscriptAuditSeverity;
  sectionKey?: string;
  message: string;
  examples?: string[];
}

export interface ManuscriptAuditReport {
  issueCount: number;
  repairCount: number;
  issues: ManuscriptAuditIssue[];
  summary: string;
}

export function slimManuscriptAudit(
  report: ManuscriptAuditReport,
  maxIssues = 8,
): ManuscriptAuditReport {
  const issues = report.issues.slice(0, maxIssues).map((i) => ({
    code: i.code,
    severity: i.severity,
    ...(i.sectionKey ? { sectionKey: i.sectionKey } : {}),
    message: i.message.slice(0, 160),
    ...(i.examples?.length ? { examples: i.examples.slice(0, 2) } : {}),
  }));
  return {
    issueCount: report.issueCount,
    repairCount: report.repairCount,
    issues,
    summary: report.summary.slice(0, 240),
  };
}
