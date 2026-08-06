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
  /**
   * 被隔离的读章节：同一章节连续读被阻断后加入；
   * 在项目有写进展（clearBlockedReads）前持续阻断，防止「穿插其他工具再读同一章」死循环。
   */
  blockedReadKeys: Set<string>;
}

export function createRepeatTracker(): RepeatTracker {
  return { lastTool: null, lastArgsKey: null, repeatCount: 0, blockedReadKeys: new Set() };
}

/**
 * 写进展后放行被隔离章节并重置连续重复计数（由 toolsNode 在项目变更工具成功后调用）。
 * 只清隔离集合不够：连续重复状态（lastTool/lastArgsKey/repeatCount）仍热，同章节会再次被正常重复逻辑拦下。
 */
export function clearBlockedReads(tracker: RepeatTracker): void {
  tracker.blockedReadKeys.clear();
  tracker.lastTool = null;
  tracker.lastArgsKey = null;
  tracker.repeatCount = 0;
}

export function checkRepeatCall(
  tracker: RepeatTracker,
  toolName: string,
  params: Record<string, unknown>,
): { allowed: boolean; warning?: string; repeatCount: number } {
  const argsKey = stableArgsKey(toolName, params);

  // 读章节隔离：被阻断过的同章节在写进展前持续拦截；repeatCount 继续递增，
  // 让 repeatGate 能从 soft 升级到 hard（超过 SOFT_REPEAT_CAP 硬停机）
  if (toolName === "read_section" && tracker.blockedReadKeys.has(argsKey)) {
    const section = String(params.section ?? "");
    tracker.repeatCount += 1;
    return {
      allowed: false,
      warning:
        `章节「${section}」已因连续重复读取被隔离，请直接基于已有内容回复用户，`
        + "或先调用写工具推进项目后再读。",
      repeatCount: tracker.repeatCount,
    };
  }

  if (tracker.lastTool === toolName && tracker.lastArgsKey === argsKey) {
    tracker.repeatCount += 1;
    if (tracker.repeatCount > COST_LIMITS.maxConsecutiveSameTool) {
      if (toolName === "read_section") {
        tracker.blockedReadKeys.add(argsKey);
      }
      return {
        allowed: false,
        warning:
          toolName === "read_section"
            ? `你已连续 ${tracker.repeatCount} 次读取同一章节（不同窗口也算）。请停止空转读取：改用 part="tail"、一次性读完整章节，或直接基于已有内容回复用户。`
            : `工具 ${toolName} 连续调用 ${tracker.repeatCount} 次且参数实质相同，已停止以防死循环`,
        repeatCount: tracker.repeatCount,
      };
    }
  } else {
    tracker.lastTool = toolName;
    tracker.lastArgsKey = argsKey;
    tracker.repeatCount = 1;
  }
  return { allowed: true, repeatCount: tracker.repeatCount };
}

/**
 * 忽略无关参数差异，避免「改一下 maxChars」仍空转重读。
 * read_section 只按 section 判定重复：Agent 反复读同一章节的不同窗口（换 offset）
 * 是死循环典型模式，不能被 offset 差异放行；正常分页读最多几窗，靠软/硬停阈值兜底。
 */
function stableArgsKey(toolName: string, params: Record<string, unknown>): string {
  if (toolName === "read_section") {
    const section = String(params.section ?? "");
    return JSON.stringify({ section });
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
