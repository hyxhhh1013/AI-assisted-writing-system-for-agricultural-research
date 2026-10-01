import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { paginated, parseListParams } from "@/lib/admin-response";
import {
  intentKindFromSnapshot,
  lastFailFromSnapshot,
  snapshotMatchesFailFilter,
} from "@/lib/admin-session-fail";

export const dynamic = "force-dynamic";

const FAIL_SCAN_CAP = 400;

/**
 * GET /api/admin/agent-sessions
 * 筛选：status / projectId / userId / q / intentKind / failTool / failVia
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);
  const intentKind = params.intentKind?.trim() || "";
  const failTool = params.failTool?.trim() || "";
  const failVia = params.failVia?.trim() || "";
  const needsScan = Boolean(failTool || failVia);
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;

  const where: Prisma.AgentSessionWhereInput = {};
  if (params.status && params.status !== "all") where.status = params.status;
  if (params.projectId) where.projectId = params.projectId;
  if (params.userId) where.userId = params.userId;
  if (params.q) where.goal = { contains: params.q };
  if (intentKind) {
    where.snapshot = { path: ["intentKind"], equals: intentKind };
  }

  const [rows, total] = needsScan
    ? await scanFailFiltered(where, failTool, failVia, page, pageSize)
    : await Promise.all([
        prisma.agentSession.findMany({
          where,
          orderBy: { updatedAt: "desc" },
          skip: (page - 1) * pageSize,
          take: pageSize,
          include: { user: { select: { name: true } } },
        }),
        prisma.agentSession.count({ where }),
      ]);

  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => Boolean(x)))];
  const projects = projectIds.length
    ? await prisma.project.findMany({
        where: { id: { in: projectIds } },
        select: { id: true, title: true },
      })
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
      intentKind: intentKindFromSnapshot(r.snapshot),
      lastFail: lastFailFromSnapshot(r.snapshot),
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    })),
    total,
    params,
  );
}

async function scanFailFiltered(
  where: Prisma.AgentSessionWhereInput,
  failTool: string,
  failVia: string,
  page: number,
  pageSize: number,
) {
  const scanned = await prisma.agentSession.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    take: FAIL_SCAN_CAP,
    include: { user: { select: { name: true } } },
  });
  const matched = scanned.filter((row) =>
    snapshotMatchesFailFilter(row.snapshot, failTool || undefined, failVia || undefined),
  );
  const start = (page - 1) * pageSize;
  return [matched.slice(start, start + pageSize), matched.length] as const;
}
