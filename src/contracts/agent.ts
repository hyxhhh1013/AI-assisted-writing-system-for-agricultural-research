/** Agent SSE 事件与请求契约 — 前后端共享 */

export type AgentStatus =
  | "planning"
  | "thinking"
  | "executing"
  | "finalizing"
  | "awaiting_checkpoint"
  | "completed"
  | "error"
  | "cancelled";

export type WritingStage =
  | "retrieving"
  | "writing"
  | "verifying"
  | "refining"
  | "completed"
  | "error"
  | "importing";

export interface AgentSubTask {
  id: string;
  title: string;
  status: "pending" | "running" | "done" | "skipped";
  /** 可选：与该子任务对齐的工具名，便于 Plan 真驱动匹配 */
  toolHints?: string[];
}

export interface AgentPlan {
  subtasks: AgentSubTask[];
  /** 当前焦点子任务 id（可选，由执行环维护） */
  focusSubtaskId?: string | null;
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
  /** 文献导入等：确认卡下方预览行 */
  preview?: string;
}

/** academic-paper 铁律检查点（S2）+ 通用澄清（ask_user） */
export type AgentCheckpointKind = "config_confirm" | "outline_approve" | "blueprint_approve" | "clarify";

export interface AgentCheckpointRequest {
  id: string;
  kind: AgentCheckpointKind;
  title: string;
  message: string;
  preview?: string;
}

export interface AgentCheckpointDecision {
  checkpointId: string;
  decision: "approve" | "revise";
  note?: string;
}

/** Agent SSE 事件联合类型 */
export type AgentSSEEvent =
  | { type: "agent/status"; status: AgentStatus }
  | { type: "agent/plan"; plan: AgentPlan }
  | { type: "agent/thought"; content: string | null }
  /** 真流式：agent 回复的逐 token 增量（前端累积进当前思考气泡） */
  | { type: "agent/thought_delta"; content: string }
  /** 写节等长工具执行期间的实时进度（服务端拼好，含章节名；live-only 不持久化）。新字段全可选，兼容旧服务器只发 label。 */
  | {
      type: "agent/progress";
      label: string;
      stage?: WritingStage;
      detail?: string;
      chars?: number;
      elapsedMs?: number;
      info?: string[];
      warnings?: string[];
      /** 导入等批量进度：已处理 / 总数 */
      done?: number;
      total?: number;
    }
  | { type: "agent/action"; tool: string; params: Record<string, unknown> }
  | {
      type: "agent/observation";
      tool: string;
      result?: AgentToolResult;
      error?: string;
    }
  | {
      type: "agent/confirm";
      tool: string;
      params: Record<string, unknown>;
      message: string;
      preview?: string;
    }
  | { type: "agent/checkpoint"; checkpoint: AgentCheckpointRequest }
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
  /**
   * 已有会话 id：
   * - 与 resume 联用 → 断点续跑
   * - 与 goal 联用（无 resume）→ 同一会话跟聊
   */
  sessionId?: string;
  resume?: boolean;
  /** 检查点决策（与 resume 联用） */
  checkpointDecision?: AgentCheckpointDecision;
  /** 写操作确认（如 import_reference） */
  confirmDecision?: {
    tool: string;
    params: Record<string, unknown>;
    approved: boolean;
    /** import_reference 确认卡勾选的候选项索引（0 起，指向 params.importItems） */
    selectedIndices?: number[];
  };
  /** 本消息携带的附件 id（上传后从 /api/agent/attachments 获得） */
  attachmentIds?: string[];
}

export function isAgentSSEEvent(value: unknown): value is AgentSSEEvent {
  if (!value || typeof value !== "object") return false;
  const type = (value as { type?: unknown }).type;
  return typeof type === "string" && type.startsWith("agent/");
}
