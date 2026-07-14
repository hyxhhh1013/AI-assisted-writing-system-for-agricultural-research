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
