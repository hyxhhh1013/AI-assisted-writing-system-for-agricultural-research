import { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/admin-auth";
import { paginated, parseListParams } from "@/lib/admin-response";
import { parseDirectionLiteratureState } from "@/contracts/direction-literature";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/directions — 研究方向列表
 * 筛选：status=active|archived|all / userId / q(名称或 slug)
 */
export async function GET(req: NextRequest) {
  const { error } = await requireAdmin(req);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const params = parseListParams(searchParams);

  const where: Prisma.DirectionWhereInput = {};
  if (params.status && params.status !== "all") where.status = params.status;
  if (params.userId) where.userId = params.userId;
  if (params.q) {
    where.OR = [
      { name: { contains: params.q } },
      { slug: { contains: params.q } },
    ];
  }

  const [rows, total] = await Promise.all([
    prisma.direction.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      skip: ((params.page ?? 1) - 1) * (params.pageSize ?? 20),
      take: params.pageSize ?? 20,
      include: { user: { select: { name: true } } },
    }),
    prisma.direction.count({ where }),
  ]);

  return paginated(
    rows.map((r) => {
      const assets = Array.isArray(r.assets) ? (r.assets as unknown[]) : [];
      const lit = parseDirectionLiteratureState(r.literatureCorpus);
      const analysis = (r.analysis ?? null) as { generatedAt?: number } | null;
      const roadmap = (r.roadmap ?? null) as { papers?: unknown[]; confirmedAt?: number } | null;
      return {
        id: r.id,
        slug: r.slug,
        name: r.name,
        description: r.description,
        categories: r.categories ?? [],
        status: r.status as "active" | "archived",
        userId: r.userId,
        userName: r.user?.name ?? undefined,
        assetCount: assets.length,
        literatureCount: lit.entries.length,
        coreLiteratureCount: lit.entries.filter((e) => e.role === "core").length,
        analysisAt: analysis?.generatedAt ?? null,
        roadmapPapers: roadmap?.papers?.length ?? 0,
        roadmapConfirmed: roadmap?.confirmedAt != null,
        createdAt: r.createdAt.toISOString(),
        updatedAt: r.updatedAt.toISOString(),
      };
    }),
    total,
    params,
  );
}
