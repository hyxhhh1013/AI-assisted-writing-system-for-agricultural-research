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
  projectId?: string;
  directionSlug?: string;
  signal: AbortSignal;
  /** 运行前注入的项目简报（标题/阶段/空白章节等） */
  projectBriefing?: string;
  /** 运行前加载的项目快照（阶段门禁用） */
  projectSnapshot?: import("@/lib/agent/project-loader").AgentProjectSnapshot | null;
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

export interface LLMWithToolsResponse {
  content: string | null;
  toolCalls: ParsedToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "unknown";
}
