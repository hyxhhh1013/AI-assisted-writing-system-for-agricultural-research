import type { AgentToolTrace } from "@/contracts/agent-session";
import type { IntentKind } from "@/contracts/agent-intent";

export const TOOL_TRACE_REASON_MAX = 240;

export type AgentToolTraceVia = NonNullable<AgentToolTrace["via"]>;

export function clipToolTraceReason(reason: string | null | undefined): string | undefined {
  const text = reason?.replace(/\s+/g, " ").trim();
  if (!text) return undefined;
  return text.length > TOOL_TRACE_REASON_MAX ? `${text.slice(0, TOOL_TRACE_REASON_MAX)}…` : text;
}

export function makeToolTrace(input: {
  tool: string;
  ok: boolean;
  intentKind?: IntentKind | null;
  reason?: string | null;
  via?: AgentToolTrace["via"];
  ms?: number;
}): AgentToolTrace {
  const via = input.via ?? (input.ok ? "ok" : "fail");
  // 成功轨迹一般不留原因。影子标记 ok=true（工具仍会执行），但 harvest 要靠 reason 聚合阶段×工具。
  const reason = input.ok && via !== "phase-shadow"
    ? undefined
    : clipToolTraceReason(input.reason);
  return {
    at: Date.now(),
    tool: input.tool,
    ok: input.ok,
    intentKind: input.intentKind ?? null,
    via,
    ...(reason ? { reason } : {}),
    ...(typeof input.ms === "number" && Number.isFinite(input.ms) && input.ms >= 0
      ? { ms: Math.round(input.ms) }
      : {}),
  };
}

export function summarizeToolTraceFails(
  trace: AgentToolTrace[] | null | undefined,
  n = 5,
): string {
  const fails = (trace ?? []).filter((item) => !item.ok).slice(-n);
  if (fails.length === 0) return "";
  return fails
    .map((item) => {
      const via = item.via && item.via !== "fail" ? `(${item.via})` : "";
      return item.reason ? `${item.tool}${via}: ${item.reason}` : `${item.tool}${via}`;
    })
    .join(" | ");
}

/** 一行 JSON，进 PM2 error/out，按 sessionId 就能对上库里的快照 */
export function logAgentSessionOutcome(input: {
  sessionId: string;
  status: string;
  intentKind?: IntentKind | null;
  goal?: string | null;
  errorMessage?: string | null;
  toolTrace?: AgentToolTrace[] | null;
}): void {
  const fails = summarizeToolTraceFails(input.toolTrace);
  if (input.status === "completed" && !fails) return;
  if (input.status === "interrupted" && !fails && !input.errorMessage) return;
  const line = JSON.stringify({
    tag: "agent-session",
    sessionId: input.sessionId,
    status: input.status,
    intentKind: input.intentKind ?? null,
    goal: (input.goal ?? "").replace(/\s+/g, " ").trim().slice(0, 120),
    error: clipToolTraceReason(input.errorMessage) ?? null,
    lastFails: fails || null,
  });
  if (input.status === "error") {
    console.error(line);
    return;
  }
  console.warn(line);
}
