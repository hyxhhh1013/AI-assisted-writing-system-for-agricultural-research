import type { ToolDefinition, ToolSafety } from "@/lib/agent/types";

export const COST_LIMITS = {
  maxIterations: 15,
  maxToolCallsPerTask: 30,
  maxConsecutiveSameTool: 3,
} as const;

const SAFETY_RULES: Record<
  ToolSafety,
  { autoExecute: boolean; requireConfirm: boolean }
> = {
  read: { autoExecute: true, requireConfirm: false },
  write: { autoExecute: true, requireConfirm: false },
  destructive: { autoExecute: false, requireConfirm: true },
};

export function shouldRequestConfirmation(tool: ToolDefinition): boolean {
  if (tool.requiresConfirmation) return true;
  return SAFETY_RULES[tool.safety].requireConfirm;
}

export function isAgentEnabled(): boolean {
  return process.env.AGENT_ENABLED === "1";
}

export function isAgentPublicEnabled(): boolean {
  return process.env.NEXT_PUBLIC_AGENT_ENABLED === "1";
}

/** Wave 2：允许 Agent 调用 write_section 等写工具 */
export function isAgentWriteEnabled(): boolean {
  return isAgentEnabled() && process.env.AGENT_WRITE_ENABLED === "1";
}

export interface RepeatTracker {
  lastTool: string | null;
  lastArgsKey: string | null;
  repeatCount: number;
}

export function createRepeatTracker(): RepeatTracker {
  return { lastTool: null, lastArgsKey: null, repeatCount: 0 };
}

export function checkRepeatCall(
  tracker: RepeatTracker,
  toolName: string,
  params: Record<string, unknown>,
): { allowed: boolean; warning?: string } {
  const argsKey = JSON.stringify(params);
  if (tracker.lastTool === toolName && tracker.lastArgsKey === argsKey) {
    tracker.repeatCount += 1;
    if (tracker.repeatCount > COST_LIMITS.maxConsecutiveSameTool) {
      return {
        allowed: false,
        warning: `工具 ${toolName} 连续调用 ${tracker.repeatCount} 次且参数相同，已停止以防死循环`,
      };
    }
  } else {
    tracker.lastTool = toolName;
    tracker.lastArgsKey = argsKey;
    tracker.repeatCount = 1;
  }
  return { allowed: true };
}
