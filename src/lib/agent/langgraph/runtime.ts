import type { AntispamTracker } from "@/lib/agent/core/antispam";
import type { RepeatTracker } from "@/lib/agent/core/safety";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";
import type { AgentSSEEvent } from "@/contracts/agent";

export interface AgentGraphRuntime {
  agentContext: AgentContext;
  tools: ToolDefinition[];
  repeatTracker: RepeatTracker;
  antispamTracker: AntispamTracker;
  /** 实时 SSE 通道：agentNode LLM 流式时的 token delta 直接推给前端（不经图快照） */
  emitLiveEvent?: (event: AgentSSEEvent) => void;
}

export function getAgentGraphRuntime(
  configurable: Record<string, unknown> | undefined,
): AgentGraphRuntime {
  const runtime = configurable?.agentRuntime as AgentGraphRuntime | undefined;
  if (
    !runtime?.agentContext
    || !runtime.tools
    || !runtime.repeatTracker
    || !runtime.antispamTracker
  ) {
    throw new Error("Agent graph runtime 未配置");
  }
  return runtime;
}
