import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { paginated, parseListParams } from "@/lib/admin-response";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/agent-sessions — 跨用户 Agent 会话列表
 * 筛选：status=running|interrupted|completed|error|all / projectId / userId / q(目标关键字)
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);

  const where: Prisma.AgentSessionWhereInput = {};
  if (params.status && params.status !== "all") where.status = params.status;
  if (params.projectId) where.projectId = params.projectId;
  if (params.userId) where.userId = params.userId;
  if (params.q) where.goal = { contains: params.q };

  const [rows, total] = await Promise.all([
    prisma.agentSession.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: ((params.page ?? 1) - 1) * (params.pageSize ?? 20),
      take: params.pageSize ?? 20,
      include: { user: { select: { name: true } } },
    }),
    prisma.agentSession.count({ where }),
  ]);

  // AgentSession.projectId 是裸字段（无 relation），批量补项目标题
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))];
  const projects = projectIds.length
    ? await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true } })
    : [];
  const titleMap = new Map(projects.map((p) => [p.id, p.title]));

  return paginated(
    rows.map((r) => ({
      id: r.id,
      userId: r.userId,
      userName: r.user?.name ?? undefined,
      projectId: r.projectId,
      projectTitle: r.projectId ? (titleMap.get(r.projectId) ?? null) : null,
      directionSlug: r.directionSlug,
      goal: r.goal.length > 160 ? `${r.goal.slice(0, 160)}…` : r.goal,
      status: r.status as "running" | "interrupted" | "completed" | "error",
      errorMessage: r.errorMessage,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    params,
  );
}
