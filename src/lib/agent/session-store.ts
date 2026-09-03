import prisma from "@/lib/prisma";
import {
  emptyAgentSessionSnapshot,
  isAgentSessionSnapshot,
  type AgentSessionListItem,
  type AgentSessionSnapshot,
  type AgentSessionStatus,
} from "@/contracts/agent-session";
import {
  graphStateToSnapshot,
  snapshotToInitialState,
} from "@/lib/agent/session-snapshot";
import { normalizeUiTranscript } from "@/lib/agent/ui-transcript";

export {
  graphStateToSnapshot,
  snapshotToInitialState,
  emptyAgentSessionSnapshot,
  isAgentSessionSnapshot,
};

/** 进程被杀后会话会永远停在 running，导致跟聊 409 */
const STALE_RUNNING_MS = 90_000;

export async function reclaimStaleRunningSessions(params: {
  userId: string;
  projectId?: string;
  sessionId?: string;
  /** 指定会话可更短阈值强制回收（跟聊遇 running 时） */
  maxAgeMs?: number;
}): Promise<number> {
  const cutoff = new Date(Date.now() - (params.maxAgeMs ?? STALE_RUNNING_MS));
  const result = await prisma.agentSession.updateMany({
    where: {
      userId: params.userId,
      status: "running",
      updatedAt: { lt: cutoff },
      ...(params.projectId ? { projectId: params.projectId } : {}),
      ...(params.sessionId ? { id: params.sessionId } : {}),
    },
    data: {
      status: "interrupted",
      errorMessage: "会话执行中断（可能因服务重启），可续跑或新开对话",
    },
  });
  return result.count;
}

/** 前端 SSE 已断但仍卡在 running：立即标 interrupted，允许跟聊/续跑 */
export async function interruptRunningSession(
  sessionId: string,
  userId: string,
): Promise<boolean> {
  const n = await reclaimStaleRunningSessions({
    userId,
    sessionId,
    maxAgeMs: 0,
  });
  return n > 0;
}

export async function createAgentSession(params: {
  userId: string;
  goal: string;
  projectId?: string;
  directionSlug?: string;
}): Promise<{ id: string }> {
  if (params.projectId) {
    await reclaimStaleRunningSessions({
      userId: params.userId,
      projectId: params.projectId,
    });
  }
  const row = await prisma.agentSession.create({
    data: {
      userId: params.userId,
      goal: params.goal,
      projectId: params.projectId ?? null,
      directionSlug: params.directionSlug ?? null,
      status: "running",
      snapshot: emptyAgentSessionSnapshot(params.goal) as object,
    },
    select: { id: true },
  });
  return row;
}

export async function getAgentSessionForUser(
  sessionId: string,
  userId: string,
): Promise<{
  id: string;
  goal: string;
  status: string;
  projectId: string | null;
  directionSlug: string | null;
  snapshot: AgentSessionSnapshot | null;
  errorMessage: string | null;
} | null> {
  const row = await prisma.agentSession.findFirst({
    where: { id: sessionId, userId },
  });
  if (!row) return null;
  return {
    id: row.id,
    goal: row.goal,
    status: row.status,
    projectId: row.projectId,
    directionSlug: row.directionSlug,
    snapshot: isAgentSessionSnapshot(row.snapshot) ? row.snapshot : null,
    errorMessage: row.errorMessage,
  };
}

export async function saveAgentSessionSnapshot(
  sessionId: string,
  snapshot: AgentSessionSnapshot,
  status?: AgentSessionStatus,
  errorMessage?: string | null,
): Promise<void> {
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: {
      snapshot: snapshot as object,
      ...(status ? { status } : {}),
      ...(errorMessage !== undefined ? { errorMessage } : {}),
    },
  });
}

export type AgentSessionClaimResult = "acquired" | "conflict" | "not_found";

/**
 * 原子抢占会话执行权（Postgres updateMany 保证并发安全）：
 * 仅当会话当前 status ∈ fromStatuses 时置为 running，防止两个请求并发双跑同一 agent 图。
 *
 * 用法：
 * - resume 续跑：fromStatuses = [interrupted, error]（completed 需走跟聊新目标）
 * - 跟聊：fromStatuses = [completed, interrupted, error]（同时写入新 goal）
 *
 * 返回：
 * - acquired：抢到执行权（已置 running），可开始跑图
 * - conflict：会话状态不在 fromStatuses（通常是已 running = 并发请求或僵尸未回收）
 * - not_found：会话不存在或无权限
 */
export async function tryAcquireAgentSession(
  sessionId: string,
  userId: string,
  opts?: {
    /** 跟聊时写入的新 goal */
    goal?: string;
    /** 允许抢占的源状态；默认 [interrupted, error] */
    fromStatuses?: readonly AgentSessionStatus[];
  },
): Promise<AgentSessionClaimResult> {
  const fromStatuses = opts?.fromStatuses ?? (["interrupted", "error"] as const);
  const claimed = await prisma.agentSession.updateMany({
    where: { id: sessionId, userId, status: { in: [...fromStatuses] } },
    data: {
      ...(opts?.goal !== undefined ? { goal: opts.goal.trim() } : {}),
      status: "running",
      errorMessage: null,
    },
  });
  if (claimed.count > 0) return "acquired";
  const existing = await getAgentSessionForUser(sessionId, userId);
  if (!existing) return "not_found";
  return "conflict";
}

export async function listAgentSessions(params: {
  userId: string;
  projectId?: string;
  status?: AgentSessionStatus;
  /** 不传 status 时返回各状态会话（历史聊天） */
  limit?: number;
  includeTranscript?: boolean;
}): Promise<AgentSessionListItem[]> {
  const rows = await prisma.agentSession.findMany({
    where: {
      userId: params.userId,
      ...(params.projectId ? { projectId: params.projectId } : {}),
      ...(params.status ? { status: params.status } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: Math.min(params.limit ?? 10, 50),
  });

  return rows.map((row) => {
    const snap = isAgentSessionSnapshot(row.snapshot) ? row.snapshot : null;
    const item: AgentSessionListItem = {
      id: row.id,
      goal: row.goal,
      status: row.status as AgentSessionStatus,
      projectId: row.projectId,
      directionSlug: row.directionSlug,
      toolCallCount: snap?.toolCallCount ?? 0,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
    if (params.includeTranscript) {
      item.uiTranscript = snap?.uiTranscript
        ? normalizeUiTranscript(snap.uiTranscript)
        : undefined;
      item.awaitingCheckpoint = snap?.awaitingCheckpoint ?? null;
      item.awaitingConfirm = snap?.awaitingConfirm ?? null;
    }
    return item;
  });
}

/** 同项目近期会话（时间正序），供历史回放与跨轮续聊 */
export async function listProjectAgentHistory(params: {
  userId: string;
  projectId: string;
  limit?: number;
}): Promise<AgentSessionListItem[]> {
  const desc = await listAgentSessions({
    userId: params.userId,
    projectId: params.projectId,
    limit: params.limit ?? 20,
    includeTranscript: true,
  });
  return desc.slice().reverse();
}
