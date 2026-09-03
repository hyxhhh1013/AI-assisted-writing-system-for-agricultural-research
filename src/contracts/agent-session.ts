/**
 * AgentSession 快照 — 可恢复 LangGraph 状态（W2-CHECKPOINT）
 * + 可选 uiTranscript 供前端历史回放
 */

import type { AgentCheckpointRequest, AgentConfirmRequest, AgentPlan, AgentSummary } from "@/contracts/agent";
import type { IntentKind } from "@/contracts/agent-intent";
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
      /** /plot 深链（机理图精修） */
      plotHref?: string;
      /** 就地改图时建议带的旧图 URL */
      replaceImageUrl?: string;
      /** 写入的章节 key（如 literature_body） */
      sectionKey?: string;
      /** replaced | appended */
      insertMode?: string;
      /** validate_citations 等结构化结果 */
      data?: unknown;
    }
  | { kind: "summary"; summary: AgentSummary }
  /** 多会话历史 /「新对话」分界（仅 UI，可不落库） */
  | { kind: "divider"; label?: string };

/**
 * write_section 执行中断点（W3-AP-WRITE-RESUME）。
 * 落在会话快照里，供 SSE 断开后续跑去重 / 沿用草稿，避免整段重跑烧 AI。
 */
export interface AgentActiveWrite {
  tool: "write_section";
  /** section+context+bullets+mode 指纹 */
  attemptKey: string;
  section: string;
  /** 原始工具参数（中断后补回 pendingToolCalls） */
  params: Record<string, unknown>;
  startedAt: number;
  updatedAt: number;
  status: "running" | "completed" | "aborted";
  stage?: string;
  draftChars: number;
  /** 阶段性 / 最终草稿（有上限，见 write-resume MAX_ACTIVE_WRITE_DRAFT_CHARS） */
  draftText?: string;
  pipelineMode?: "fast" | "full";
  references?: string[];
  completedSummary?: string;
}

/**
 * 会话工具轨迹（W3-AP-ARCH-02）：一次工具调用的结局。
 * 排障用（空转/乱搜时可一眼看「最近调了什么、成没成」），不进前端 UI。
 * 落快照时截断到 MAX_TOOL_TRACE 条。
 */
export interface AgentToolTrace {
  /** epoch ms */
  at: number;
  tool: string;
  ok: boolean;
  /** 该工具执行时的会话意图（跟聊继承；旧轨迹可能缺） */
  intentKind?: IntentKind | null;
}

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
  /** write_section 执行中 / 中断草稿（跟聊新目标时应清空） */
  activeWrite?: AgentActiveWrite | null;
  /** 本轮意图（跟聊短回复继承；旧快照缺省则本轮重判） */
  intentKind?: IntentKind | null;
  /** 最近工具轨迹（排障用；旧快照缺字段当 []） */
  toolTrace?: AgentToolTrace[];
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
  /** 历史恢复：服务端仍在等人确认时带回，避免刷新后只剩孤儿条 */
  awaitingCheckpoint?: AgentCheckpointRequest | null;
  awaitingConfirm?: AgentConfirmRequest | null;
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
