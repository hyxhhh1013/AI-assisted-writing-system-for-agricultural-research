/**
 * 项目快照/简报的会话内缓存与刷新。
 *
 * 背景：同一轮 agent 运行里 loadAgentProject（整项目 DB 读：project + references
 * + sections + blueprint + passport）会被多次触发——run 前加载、写前置自补、
 * 每个写工具落地后刷新、confirm 路径刷新。每次都是全量查询。
 *
 * 策略：
 * - getAgentProjectSnapshot：优先复用 ctx.projectSnapshot；未加载才查库并缓存到 ctx。
 * - refreshAgentProjectContext：仅当「无快照」或「已标脏」时才查库重载；否则复用。
 *   写工具落地后由调用方先 markAgentProjectDirty 再 refresh，保证写后必取新值；
 *   而「写前置自补」「同轮二次刷新」等非写入刷新直接复用，消除重复查库。
 */

import type { AgentProjectSnapshot } from "@/lib/agent/project-loader";
import { loadAgentProject } from "@/lib/agent/project-loader";
import { appendPhasePackToBriefing } from "@/lib/agent/phase-task-pack";
import { formatAgentProjectBriefing } from "@/lib/agent/project-briefing";
import { appendMemoryToBriefing } from "@/lib/agent/session-memory";
import { buildRecentAgentMemoryBlock } from "@/lib/agent/session-memory";
import { formatWorkMemoryBlock } from "@/lib/agent/work-memory";
import type { AgentContext } from "@/lib/agent/types";

/** 取快照：快照已加载且未标脏则复用；否则查库一次并缓存 */
export async function getAgentProjectSnapshot(
  ctx: AgentContext,
): Promise<AgentProjectSnapshot | null> {
  if (
    ctx.projectSnapshot !== null
    && ctx.projectSnapshot !== undefined
    && ctx.projectDirty !== true
  ) {
    return ctx.projectSnapshot;
  }
  if (!ctx.projectId) return null;
  const snap = await loadAgentProject(ctx.userId, ctx.projectId);
  ctx.projectSnapshot = snap;
  ctx.projectDirty = false;
  return snap;
}

/** 标记项目已被写工具变更：下一次 refresh 必须查库重载 */
export function markAgentProjectDirty(ctx: AgentContext): void {
  ctx.projectDirty = true;
}

/**
 * 刷新项目简报（供 LLM 上下文）。快照最新且未标脏时直接复用，不查库。
 * 简报 = 阶段任务包 + 项目简报 + 跨会话记忆 + 本会话工作记忆。
 * @param opts.withMemory 默认 true；传 false 时跳过跨会话记忆拼接（run-graph 前导/confirm 用，
 *   由主流程按门禁+软超时统一拼一次，避免双拼）。
 */
export async function refreshAgentProjectContext(
  ctx: AgentContext,
  opts?: { withMemory?: boolean },
): Promise<void> {
  if (!ctx.projectId) return;
  // 注：须显式排除 undefined —— projectSnapshot 未加载（AgentContext 中为可选，缺省 undefined）
  // 时也要查库，否则首轮 refresh 会命中「快照非 null」误判直接 return，永不加载。
  if (
    ctx.projectSnapshot !== null
    && ctx.projectSnapshot !== undefined
    && ctx.projectDirty !== true
  ) {
    return;
  }
  let snap: AgentProjectSnapshot | null;
  try {
    snap = await loadAgentProject(ctx.userId, ctx.projectId);
  } catch {
    /* 刷新失败不阻断：保留旧快照与简报，dirty 保持置位以便下次重试 */
    return;
  }
  ctx.projectSnapshot = snap;
  ctx.projectDirty = false;
  let briefing = appendPhasePackToBriefing(
    formatAgentProjectBriefing(snap),
    snap,
  );
  // withMemory=false（前导/confirm 用）：跨会话记忆由 run-graph 主流程按门禁+软超时拼一次，
  // 避免前导 refresh 与主流程双拼；toolsNode 写后刷新保持默认 true（重建含记忆的完整简报）。
  if (opts?.withMemory !== false) {
    try {
      const memory = await buildRecentAgentMemoryBlock(ctx.userId, ctx.projectId);
      briefing = appendMemoryToBriefing(briefing, memory);
    } catch {
      /* ignore */
    }
  }
  const workBlock = ctx.workMemory
    ? formatWorkMemoryBlock(ctx.workMemory)
    : null;
  if (workBlock) {
    briefing = appendMemoryToBriefing(briefing, workBlock);
  }
  ctx.projectBriefing = briefing;
}
