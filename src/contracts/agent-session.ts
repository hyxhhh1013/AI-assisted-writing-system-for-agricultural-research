/**
 * AgentSession 快照 — 可恢复 LangGraph 状态（W2-CHECKPOINT）
 * + 可选 uiTranscript 供前端历史回放
 */

import type { AgentPlan, AgentSummary } from "@/contracts/agent";
import type { LLMMessage, ParsedToolCall } from "@/lib/agent/types";

export type AgentSessionStatus =
  | "running"
  | "interrupted"
  | "completed"
  | "error";

/** 前端对话气泡（与 hooks/use-agent 对齐） */
export type AgentUiMessage =
  | { kind: "user"; text: string }
  | { kind: "thought"; text: string }
  | { kind: "action"; tool: string; params: Record<string, unknown> }
  | {
      kind: "observation";
      tool: string;
      summary?: string;
      error?: string;
      /** generate_chart 等工具返回的预览图 */
      imageUrl?: string;
      /** validate_citations 等结构化结果 */
      data?: unknown;
    }
  | { kind: "summary"; summary: AgentSummary }
  /** 多会话历史 /「新对话」分界（仅 UI，可不落库） */
  | { kind: "divider"; label?: string };

export interface AgentSessionSnapshot {
  version: 1;
  messages: LLMMessage[];
  plan: AgentPlan | null;
  iteration: number;
  toolCallCount: number;
  toolSummaries: string[];
  /** 结构化工具结果（完成度判断用；旧快照可能缺失，读取时兜底为空数组） */
  observations: import("@/lib/agent/types").ToolObservation[];
  pendingToolCalls: ParsedToolCall[];
  finished: boolean;
  error: string | null;
  /** S2：等待中的检查点 */
  awaitingCheckpoint?: import("@/contracts/agent").AgentCheckpointRequest | null;
  /** 写工具人在环确认（如 import_reference） */
  awaitingConfirm?: import("@/contracts/agent").AgentConfirmRequest | null;
  /** 本会话已通过的检查点种类 */
  approvedCheckpointKinds?: import("@/contracts/agent").AgentCheckpointKind[];
  /** 面向用户的对话气泡（历史聊天） */
  uiTranscript?: AgentUiMessage[];
  /** 本会话工作记忆 */
  workMemory?: import("@/lib/agent/work-memory").AgentWorkMemory | null;
  /** 本会话附件 id（traceability；归属以 AgentAttachment.sessionId 为准） */
  attachmentIds?: string[];
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
  /** 请求 includeTranscript=1 时返回 */
  uiTranscript?: AgentUiMessage[];
}

export function isAgentSessionSnapshot(value: unknown): value is AgentSessionSnapshot {
  if (!value || typeof value !== "object") return false;
  const v = value as { version?: unknown; messages?: unknown };
  return v.version === 1 && Array.isArray(v.messages);
}

export function emptyAgentSessionSnapshot(goal: string): AgentSessionSnapshot {
  const trimmed = goal.trim();
  return {
    version: 1,
    messages: [{ role: "user", content: trimmed }],
    plan: null,
    iteration: 0,
    toolCallCount: 0,
    toolSummaries: [],
    observations: [],
    pendingToolCalls: [],
    finished: false,
    error: null,
    awaitingCheckpoint: null,
    awaitingConfirm: null,
    approvedCheckpointKinds: [],
    uiTranscript: trimmed ? [{ kind: "user", text: trimmed }] : [],
  };
}
