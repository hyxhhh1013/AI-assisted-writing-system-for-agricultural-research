/**
 * 一致性检查 API 客户端（UI → /api/consistency、/api/consistency/fix）
 */

import type {
  ConsistencyCheckInput,
  ConsistencyReport,
  FixableReport,
  FixIssueRequest,
  IssueStatus,
} from "@/contracts/consistency";
import { readSSEStream } from "@/lib/sse-client";

export type {
  ConsistencyCheckInput,
  ConsistencyIssue,
  ConsistencyReport,
  FixableIssue,
  FixableReport,
  FixIssueRequest,
  IssueStatus,
} from "@/contracts/consistency";

export function toFixableReport(report: ConsistencyReport): FixableReport {
  return {
    ...report,
    issues: report.issues.map((issue) => ({ ...issue, status: "open" as IssueStatus })),
  };
}

/** POST /api/consistency — 全篇一致性检查 */
export async function runConsistencyCheck(
  input: ConsistencyCheckInput,
): Promise<ConsistencyReport> {
  const res = await fetch("/api/consistency", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "检查失败");
  }
  return res.json() as Promise<ConsistencyReport>;
}

/** POST /api/consistency/fix — SSE 流式定点修正 */
export async function fixConsistencyIssue(request: FixIssueRequest): Promise<string | null> {
  const res = await fetch("/api/consistency/fix", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) return null;

  let fixedContent = "";
  try {
    await readSSEStream(res, {
      onEvent: (event) => {
        if (event.type === "error") {
          throw new Error(typeof event.error === "string" ? event.error : "修复失败");
        }
        if (event.type === "delta" && typeof event.content === "string") {
          fixedContent += event.content;
        } else if (event.type === "done" && typeof event.content === "string") {
          fixedContent = event.content;
        }
      },
    });
  } catch {
    return null;
  }
  return fixedContent || null;
}
