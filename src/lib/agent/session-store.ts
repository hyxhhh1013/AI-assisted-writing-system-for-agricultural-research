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

export {
  graphStateToSnapshot,
  snapshotToInitialState,
  emptyAgentSessionSnapshot,
  isAgentSessionSnapshot,
};

export async function createAgentSession(params: {
  userId: string;
  goal: string;
  projectId?: string;
  directionSlug?: string;
}): Promise<{ id: string }> {
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

export async function listAgentSessions(params: {
  userId: string;
  projectId?: string;
  status?: AgentSessionStatus;
  limit?: number;
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
    return {
      id: row.id,
      goal: row.goal,
      status: row.status as AgentSessionStatus,
      projectId: row.projectId,
      directionSlug: row.directionSlug,
      toolCallCount: snap?.toolCallCount ?? 0,
      updatedAt: row.updatedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  });
}
