import { NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { paginated } from "@/lib/admin-response";
import { parseListParams } from "@/lib/admin-response";

export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);

  const where: any = {};
  if (params.projectId) where.projectId = params.projectId;
  if (params.risk) where.overallRisk = params.risk;
  if (params.q) where.title = { contains: params.q };

  const [checks, total] = await Promise.all([
    prisma.plagiarismCheck.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: ((params.page ?? 1) - 1) * (params.pageSize ?? 20),
      take: params.pageSize ?? 20,
      select: {
        id: true, projectId: true, title: true, status: true,
        maxSimilarity: true, overallRisk: true, createdAt: true,
        _count: { select: { matches: true } },
      },
    }),
    prisma.plagiarismCheck.count({ where }),
  ]);

  return paginated(
    checks.map(c => ({
      id: c.id, projectId: c.projectId, title: c.title, status: c.status,
      maxSimilarity: c.maxSimilarity, overallRisk: c.overallRisk,
      matchCount: c._count.matches,
      createdAt: c.createdAt.toISOString(),
    })),
    total,
    params,
  );
}
