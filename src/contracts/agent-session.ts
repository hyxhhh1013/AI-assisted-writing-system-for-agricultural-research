/**
 * AgentSession 快照 — 可恢复 LangGraph 状态（W2-CHECKPOINT）
 */

import type { AgentPlan } from "@/contracts/agent";
import type { LLMMessage, ParsedToolCall } from "@/lib/agent/types";

export type AgentSessionStatus =
  | "running"
  | "interrupted"
  | "completed"
  | "error";

export interface AgentSessionSnapshot {
  version: 1;
  messages: LLMMessage[];
  plan: AgentPlan | null;
  iteration: number;
  toolCallCount: number;
  toolSummaries: string[];
  pendingToolCalls: ParsedToolCall[];
  finished: boolean;
  error: string | null;
}

export interface AgentSessionListItem {
  id: string;
  goal: string;
  status: AgentSessionStatus;
  projectId: string | null;
  directionSlug: string | null;
  toolCallCount: number;
  updatedAt: string;
  createdAt: string;
}

export function isAgentSessionSnapshot(value: unknown): value is AgentSessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as { version?: unknown; messages?: unknown };
  return v.version === 1 && Array.isArray(v.messages);
}

export function emptyAgentSessionSnapshot(goal: string): AgentSessionSnapshot {
  return {
    version: 1,
    messages: [{ role: "user", content: goal }],
    plan: null,
    iteration: 0,
    toolCallCount: 0,
    toolSummaries: [],
    pendingToolCalls: [],
    finished: false,
    error: null,
  };
}
