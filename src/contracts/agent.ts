/** Agent SSE 事件与请求契约 — 前后端共享 */

export type AgentStatus =
  | "planning"
  | "thinking"
  | "executing"
  | "finalizing"
  | "completed"
  | "error"
  | "cancelled";

export interface AgentSubTask {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "skipped";
}

export interface AgentPlan {
  subtasks: AgentSubTask[];
}

export interface AgentToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  summary?: string;
}

export interface AgentKeyFinding {
  fact: string;
  source: string;
  confidence: "high" | "medium" | "low";
}

export interface AgentSummary {
  text: string;
  toolCallCount: number;
  keyFindings: AgentKeyFinding[];
}

export interface AgentConfirmRequest {
  tool: string;
  params: Record<string, unknown>;
  message: string;
}

/** Agent SSE 事件联合类型 */
export type AgentSSEEvent =
  | { type: "agent/status"; status: AgentStatus }
  | { type: "agent/plan"; plan: AgentPlan }
  | { type: "agent/thought"; content: string | null }
  | { type: "agent/action"; tool: string; params: Record<string, unknown> }
  | {
      type: "agent/observation";
      tool: string;
      result?: AgentToolResult;
      error?: string;
    }
  | { type: "agent/confirm"; tool: string; params: Record<string, unknown>; message: string }
  | { type: "agent/complete"; summary: AgentSummary }
  | { type: "agent/error"; error: string }
  | {
      type: "agent/session";
      sessionId: string;
      status: "running" | "interrupted" | "completed" | "error";
      resumed?: boolean;
      toolSummaries?: string[];
    };

export interface AgentRequest {
  goal?: string;
  projectId?: string;
  directionSlug?: string;
  mode?: "auto" | "guided";
  /** 续跑：已有 AgentSession id */
  sessionId?: string;
  resume?: boolean;
}

export function isAgentSSEEvent(value: unknown): value is AgentSSEEvent {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && type.startsWith("agent/");
}
