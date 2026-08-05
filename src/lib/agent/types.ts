import type {
  AgentKeyFinding,
  AgentPlan,
  AgentSSEEvent,
  AgentSummary,
  AgentToolResult,
} from "@/contracts/agent";

export type { AgentKeyFinding, AgentPlan, AgentSSEEvent, AgentSummary, AgentToolResult };

export type ToolSafety = "read" | "write" | "destructive";

export interface ToolParameterSchema {
  type: string;
  description: string;
  enum?: string[];
  items?: { type: string };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameterSchema>;
    required: string[];
  };
  execute: (params: Record<string, unknown>, ctx: AgentContext) => Promise<AgentToolResult>;
  safety: ToolSafety;
  requiresConfirmation?: boolean;
}

export interface AgentContext {
  userId: string;
  /** 当前会话 id（会话级附件归属校验用） */
  sessionId?: string;
  projectId?: string;
  directionSlug?: string;
  signal: AbortSignal;
  /** 运行前注入的项目简报（标题/阶段/空白章节等） */
  projectBriefing?: string;
  /** 运行前加载的项目快照（阶段门禁用） */
  projectSnapshot?: import("@/lib/agent/project-loader").AgentProjectSnapshot | null;
  /** 项目已被本会话写工具变更：下一次 refreshAgentProjectContext 必须重载（防同轮复用陈旧快照） */
  projectDirty?: boolean;
  /** 本会话工作记忆（主张/决策/待办） */
  workMemory?: import("@/lib/agent/work-memory").AgentWorkMemory | null;
  budget: {
    maxIterations: number;
    currentIteration: number;
    maxToolCalls: number;
    toolCallCount: number;
  };
}

export interface AgentLoopOptions {
  goal: string;
  context: AgentContext;
  tools: ToolDefinition[];
  /** 已有会话：续跑或边跑边落盘 */
  sessionId?: string;
  /** 从快照恢复的初始图状态 */
  resumeState?: Partial<import("@/lib/agent/langgraph/state").AgentGraphStateType>;
  /** 同一会话跟聊（completed 后带新 goal），非断点 resume */
  followUp?: boolean;
  /** S2：检查点决策（续跑时注入） */
  checkpointDecision?: import("@/contracts/agent").AgentCheckpointDecision;
  /** 决策对应的检查点种类（来自中断快照） */
  pendingCheckpointKind?: import("@/contracts/agent").AgentCheckpointKind;
  /** 写工具确认决策 */
  confirmDecision?: {
    tool: string;
    params: Record<string, unknown>;
    approved: boolean;
  };
  /** 附件清单（首条 user 消息注入用；非 resume 时生效） */
  attachmentManifest?: string;
  /** 本会话附件 id（快照持久化用） */
  attachmentIds?: string[];
}

export interface LLMMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  name?: string;
}

export interface ParsedToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
}

/** 一次工具执行的结构化结果（供完成度判断，替代解析 toolSummaries 字符串） */
export interface ToolObservation {
  tool: string;
  success: boolean;
  error?: string | null;
  /** 工具 execute 返回的 data（如 import_reference.imported、write_section.persisted） */
  data?: unknown;
}

export interface LLMWithToolsResponse {
  content: string | null;
  toolCalls: ParsedToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "unknown";
}
