import type { AntispamTracker } from "@/lib/agent/core/antispam";
import type { RepeatTracker } from "@/lib/agent/core/safety";
import type { AgentContext, ToolDefinition } from "@/lib/agent/types";

export interface AgentGraphRuntime {
  agentContext: AgentContext;
  tools: ToolDefinition[];
  repeatTracker: RepeatTracker;
  antispamTracker: AntispamTracker;
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
