import { isAgentSessionSnapshot } from "@/contracts/agent-session";
import type { IntentKind } from "@/contracts/agent-intent";

export interface AdminSessionLastFail {
  tool: string;
  via?: string;
  reason?: string;
  at?: number;
}

export function intentKindFromSnapshot(snapshot: unknown): IntentKind | null {
  if (!isAgentSessionSnapshot(snapshot)) return null;
  return snapshot.intentKind ?? null;
}

export function lastFailFromSnapshot(snapshot: unknown): AdminSessionLastFail | null {
  if (!isAgentSessionSnapshot(snapshot)) return null;
  const fails = (snapshot.toolTrace ?? []).filter((row) => !row.ok);
  const last = fails[fails.length - 1];
  if (!last) return null;
  return {
    tool: last.tool,
    ...(last.via ? { via: last.via } : {}),
    ...(last.reason ? { reason: last.reason } : {}),
    at: last.at,
  };
}

export function snapshotMatchesFailFilter(
  snapshot: unknown,
  failTool?: string,
  failVia?: string,
): boolean {
  if (!failTool && !failVia) return true;
  if (!isAgentSessionSnapshot(snapshot)) return false;
  return (snapshot.toolTrace ?? []).some((row) => {
    if (row.ok) return false;
    if (failTool && row.tool !== failTool) return false;
    if (failVia && row.via !== failVia) return false;
    return true;
  });
}
