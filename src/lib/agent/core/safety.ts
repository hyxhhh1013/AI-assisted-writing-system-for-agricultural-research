import type { ToolDefinition, ToolSafety } from "@/lib/agent/types";

export const COST_LIMITS = {
  /** 对齐 academic-paper：多阶段对话可多轮工具；仍由用户驱动，非无人跑全文 */
  maxIterations: 32,
  maxToolCallsPerTask: 64,
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

/** 前端展示「可写回」提示（与 AGENT_WRITE_ENABLED 对齐） */
export function isAgentWritePublicEnabled(): boolean {
  return (
    isAgentPublicEnabled()
    && process.env.NEXT_PUBLIC_AGENT_WRITE_ENABLED === "1"
  );
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
  const argsKey = stableArgsKey(toolName, params);
  if (tracker.lastTool === toolName && tracker.lastArgsKey === argsKey) {
    tracker.repeatCount += 1;
    if (tracker.repeatCount > COST_LIMITS.maxConsecutiveSameTool) {
      return {
        allowed: false,
        warning:
          toolName === "read_section"
            ? `你已连续多次读取同一章节窗口。请改用 part="tail" / 更大的 offset，或停止读取并直接回复用户（已有长文时先问要不要改写）。`
            : `工具 ${toolName} 连续调用 ${tracker.repeatCount} 次且参数实质相同，已停止以防死循环`,
      };
    }
  } else {
    tracker.lastTool = toolName;
    tracker.lastArgsKey = argsKey;
    tracker.repeatCount = 1;
  }
  return { allowed: true };
}

/** 忽略无关参数差异，避免「改一下 maxChars」仍空转重读 */
function stableArgsKey(toolName: string, params: Record<string, unknown>): string {
  if (toolName === "read_section") {
    const section = String(params.section ?? "");
    const part = String(params.part ?? "head");
    const offset = Number.isFinite(Number(params.offset))
      ? Math.floor(Number(params.offset))
      : part === "tail"
        ? "tail"
        : 0;
    return JSON.stringify({ section, offset });
  }
  if (toolName === "search_knowledge" || toolName === "search_external") {
    const q = String(params.query ?? params.q ?? "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ")
      .slice(0, 80);
    return JSON.stringify({ q });
  }
  return JSON.stringify(params);
}
