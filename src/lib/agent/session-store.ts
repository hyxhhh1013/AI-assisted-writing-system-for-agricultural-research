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

/** 跟聊开始：更新 goal 并标为 running */
export async function markAgentSessionFollowUp(
  sessionId: string,
  goal: string,
): Promise<void> {
  await prisma.agentSession.update({
    where: { id: sessionId },
    data: {
      goal: goal.trim(),
      status: "running",
      errorMessage: null,
    },
  });
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
